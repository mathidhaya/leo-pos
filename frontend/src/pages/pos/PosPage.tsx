import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ShoppingCart } from "lucide-react";
import { fetchCatalog, requestQuote } from "../../api/pos";
import CartPanel from "../../components/pos/CartPanel";
import CategoryTabs from "../../components/pos/CategoryTabs";
import OrderSummaryModal from "../../components/pos/OrderSummaryModal";
import ProductCard from "../../components/pos/ProductCard";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Modal from "../../components/ui/Modal";
import { useAuth } from "../../hooks/useAuth";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { usePosCart } from "../../hooks/usePosCart";
import type { PosProduct, Quote } from "../../types/pos";
import {
  MAX_LINES,
  MAX_QUANTITY,
  calculateBill,
  paiseToDecimalString,
  parseMoneyToPaise,
  parsePercentToBasisPoints,
} from "../../utils/billing";
import { getErrorCode, getErrorMessage } from "../../utils/errors";
import { formatRupees } from "../../utils/money";
import { describeOrder, readDelivery, readDiscount, validateDetails } from "../../utils/posForm";

const stockLimit = (product: PosProduct) => Math.min(product.stock.quantity, MAX_QUANTITY);

export default function PosPage() {
  const { user } = useAuth();
  return user ? <PosScreen userId={user.id} /> : null;
}

function PosScreen({ userId }: { userId: string }) {
  const [cart, dispatch] = usePosCart(userId);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [showDetailErrors, setShowDetailErrors] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteWarning, setQuoteWarning] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const catalogQuery = useQuery({
    queryKey: ["pos-catalog"],
    queryFn: fetchCatalog,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
  const catalog = catalogQuery.data;

  const productsById = useMemo(
    () => new Map((catalog?.products ?? []).map((product) => [product.id, product] as const)),
    [catalog]
  );
  const qtyById = useMemo(
    () => new Map(cart.items.map((item) => [item.productId, item.quantity] as const)),
    [cart.items]
  );

  // A message disappears by itself after a few seconds
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  // If a category was disabled meanwhile, go back to "All"
  useEffect(() => {
    if (catalog && category && !catalog.categories.some((c) => c.id === category)) setCategory("");
  }, [catalog, category]);

  // When the menu or stock changes: remove items that are gone, lower quantities that are too high
  useEffect(() => {
    if (!catalog) return;

    const messages: string[] = [];
    for (const item of cart.items) {
      const product = productsById.get(item.productId);
      if (!product) {
        messages.push("An item is no longer available and was removed from the order.");
      } else if (stockLimit(product) < 1) {
        messages.push(`"${product.name}" is out of stock and was removed from the order.`);
      } else if (item.quantity > stockLimit(product)) {
        messages.push(`Only ${stockLimit(product)} of "${product.name}" in stock. Quantity lowered.`);
      }
    }
    if (messages.length === 0) return;

    const limits: Record<string, number> = {};
    for (const product of catalog.products) limits[product.id] = stockLimit(product);
    dispatch({ type: "sync", limits });
    setNotice([...new Set(messages)].join(" "));
  }, [catalog, productsById, cart.items, dispatch]);

  // ---------- the bill, calculated live from the cart ----------

  const lines = useMemo(
    () =>
      cart.items.flatMap((item) => {
        const product = productsById.get(item.productId);
        return product ? [{ product, quantity: item.quantity }] : [];
      }),
    [cart.items, productsById]
  );

  const discountRead = useMemo(
    () => readDiscount(cart.discountKind, cart.discountValue),
    [cart.discountKind, cart.discountValue]
  );
  const deliveryRead = useMemo(
    () => (cart.orderType === "DELIVERY" ? readDelivery(cart.deliveryCharge) : { paise: 0, error: null }),
    [cart.orderType, cart.deliveryCharge]
  );

  const { bill, billError } = useMemo(() => {
    if (lines.length === 0) return { bill: null, billError: null };

    const base = {
      lines: lines.map(({ product, quantity }) => ({
        key: product.id,
        unitPricePaise: parseMoneyToPaise(product.sellingPrice) ?? 0,
        quantity,
        gstBasisPoints: parsePercentToBasisPoints(product.gstPercent) ?? 0,
      })),
      deliveryChargePaise: deliveryRead.error ? 0 : deliveryRead.paise,
    };

    const full = calculateBill({ ...base, discount: discountRead.input });
    if (full.ok) return { bill: full.bill, billError: null };

    // e.g. the discount is bigger than the bill: still show the bill without it
    const withoutDiscount = calculateBill({ ...base, discount: { type: "none" } });
    return { bill: withoutDiscount.ok ? withoutDiscount.bill : null, billError: full.error };
  }, [lines, discountRead, deliveryRead]);

  const discountError = discountRead.error ?? billError;
  const detailErrors = useMemo(() => validateDetails(cart, deliveryRead.error), [cart, deliveryRead.error]);

  // ---------- the product grid ----------

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (catalog?.products ?? []).filter(
      (product) =>
        (!category || product.categoryId === category) &&
        (!q || product.name.toLowerCase().includes(q) || product.sku.toLowerCase().includes(q))
    );
  }, [catalog, category, search]);

  function addProduct(product: PosProduct) {
    const limit = stockLimit(product);
    const current = qtyById.get(product.id) ?? 0;

    if (limit < 1) return setNotice(`"${product.name}" is out of stock.`);
    if (current >= limit) return setNotice(`Only ${limit} of "${product.name}" in stock.`);
    if (current === 0 && cart.items.length >= MAX_LINES) {
      return setNotice(`An order can have at most ${MAX_LINES} different items.`);
    }

    setNotice(null);
    dispatch({ type: "add", productId: product.id, limit });
  }

  function setQuantity(productId: string, quantity: number) {
    const product = productsById.get(productId);
    if (product) dispatch({ type: "setQuantity", productId, quantity, limit: stockLimit(product) });
  }

  // Typing a product code and pressing Enter adds that product (fast, scanner-friendly)
  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    const q = search.trim().toLowerCase();
    if (!q) return;

    const exact = (catalog?.products ?? []).find((product) => product.sku.toLowerCase() === q);
    const target = exact ?? (visible.length === 1 ? visible[0] : undefined);
    if (target) {
      addProduct(target);
      setSearch("");
    }
  }

  // ---------- Proceed to Payment: the server checks the bill ----------

  async function handleProceed() {
    setShowDetailErrors(true);
    setQuoteError(null);

    if (lines.length === 0 || discountError || Object.keys(detailErrors).length > 0 || !bill) return;

    setQuoting(true);
    try {
      const result = await requestQuote({
        items: lines.map(({ product, quantity }) => ({ productId: product.id, quantity })),
        discount:
          discountRead.input.type === "none"
            ? { type: "none" }
            : { type: cart.discountKind, value: cart.discountValue.trim() },
        orderType: cart.orderType,
        deliveryCharge: cart.orderType === "DELIVERY" ? cart.deliveryCharge.trim() || "0" : undefined,
      });

      const matches = paiseToDecimalString(bill.grandTotalPaise) === result.grandTotal;
      setQuoteWarning(
        matches ? null : "Prices or stock changed since this order was built. The totals below are the verified ones."
      );
      if (!matches) void catalogQuery.refetch();
      setQuote(result);
    } catch (err) {
      setQuoteError(getErrorMessage(err));
      if (getErrorCode(err) === "CART_UNAVAILABLE") void catalogQuery.refetch();
    } finally {
      setQuoting(false);
    }
  }

  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  const cartPanel = (
    <CartPanel
      cart={cart}
      dispatch={dispatch}
      lines={lines}
      bill={bill}
      discountError={discountError}
      detailErrors={detailErrors}
      showDetailErrors={showDetailErrors}
      quoting={quoting}
      quoteError={quoteError}
      compact={!isDesktop}
      onQuantity={setQuantity}
      onProceed={handleProceed}
      onClear={() => setConfirmClear(true)}
    />
  );

  return (
    <div className="pb-24 lg:pb-0">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">New Order</h1>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-6">
        <section className="min-w-0 space-y-4" aria-label="Menu">
          <form onSubmit={handleSearchSubmit} role="search">
            <label htmlFor="pos-search" className="sr-only">
              Search products by name or code
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                id="pos-search"
                type="search"
                autoFocus
                autoComplete="off"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or product code, then press Enter"
                className="h-12 w-full rounded-xl border border-gray-300 bg-white pl-12 pr-4 text-base focus:border-leo-600 focus:outline-2 focus:outline-leo-600"
              />
            </div>
          </form>

          {catalog && <CategoryTabs categories={catalog.categories} selected={category} onSelect={setCategory} />}

          {notice && <Alert variant="info">{notice}</Alert>}

          {catalogQuery.isPending && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="status" aria-label="Loading menu">
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} className="h-60 animate-pulse rounded-2xl bg-gray-200" />
              ))}
            </div>
          )}

          {!catalog && catalogQuery.isError && (
            <div className="space-y-3">
              <Alert variant="error">{getErrorMessage(catalogQuery.error)}</Alert>
              <Button onClick={() => void catalogQuery.refetch()}>Try again</Button>
            </div>
          )}

          {catalog && catalogQuery.isError && (
            <Alert variant="error">{getErrorMessage(catalogQuery.error)} Showing the last loaded menu.</Alert>
          )}

          {catalog && catalog.products.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
              <p className="font-medium text-gray-900">Nothing is available to sell yet</p>
              <p className="text-sm text-gray-500">Add products, or turn them on, in the Products page.</p>
            </div>
          )}

          {catalog && catalog.products.length > 0 && visible.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
              <p className="font-medium text-gray-900">No products match</p>
              <p className="text-sm text-gray-500">Try a different search or category.</p>
            </div>
          )}

          {visible.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {visible.map((product) => (
                <li key={product.id}>
                  <ProductCard product={product} inCart={qtyById.get(product.id) ?? 0} onAdd={() => addProduct(product)} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {isDesktop && (
          <aside
            aria-label="Current order"
            className="sticky top-4 flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-sm"
          >
            {cartPanel}
          </aside>
        )}
      </div>

      {!isDesktop && lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white p-3">
          <Button fullWidth onClick={() => setCartOpen(true)}>
            <ShoppingCart className="h-5 w-5" />
            View order &middot; {itemCount} item{itemCount === 1 ? "" : "s"}
            {bill && <> &middot; {formatRupees(bill.grandTotalPaise)}</>}
          </Button>
        </div>
      )}

      {!isDesktop && cartOpen && (
        <Modal title="Current order" onClose={() => setCartOpen(false)}>
          <div className="-mx-5 -my-5 flex flex-col">{cartPanel}</div>
        </Modal>
      )}

      {quote && (
        <OrderSummaryModal
          quote={quote}
          details={describeOrder(cart)}
          warning={quoteWarning}
          onClose={() => setQuote(null)}
        />
      )}

      {confirmClear && (
        <ConfirmDialog
          title="Clear order"
          confirmLabel="Clear order"
          message="Remove all items and customer details from this order?"
          onConfirm={async () => {
            dispatch({ type: "clear" });
            setConfirmClear(false);
            setShowDetailErrors(false);
            setQuoteError(null);
          }}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  );
}
