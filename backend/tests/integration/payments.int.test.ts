import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, cleanupAll, createShop, download, makeCategory, makeProduct, paise, placeOrder, payOrder, prisma, sortedStatuses, stockOf, today, uuid, type TestShop } from "./helpers";

afterAll(cleanupAll);

describe("taking payments", () => {
  let shop: TestShop;
  let other: TestShop;
  let item: { id: string }; // 450.00 with no GST
  const cashier = () => api(shop.cashier.token);
  const newOrder = (quantity = 1, extra = {}) => placeOrder(shop.cashier.token, { items: [{ productId: item.id, quantity }], ...extra });
  const pay = (orderId: string, method: string, amountReceived?: string, key: string = uuid()) =>
    cashier().post("/payments", { orderId, method, amountReceived, idempotencyKey: key });

  beforeAll(async () => {
    shop = await createShop("payments");
    other = await createShop("payments-other");
    const cat = await makeCategory(shop.id, "Menu");
    item = await makeProduct(shop.id, cat.id, { name: "Big Plate", price: "450.00", gst: "0.00", stock: 100 });
  });

  it("cash: 450 paid with 500 gives 50 change, marks the order paid, and makes invoice LC-000001", async () => {
    const order = await newOrder();
    expect(order.grandTotal).toBe("450.00");

    const res = await pay(order.id, "CASH", "500");
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      method: "CASH",
      amount: "450.00",
      amountReceived: "500.00",
      changeGiven: "50.00",
      invoiceNo: "LC-000001",
    });

    const after = await cashier().get(`/orders/${order.id}`);
    expect(after.body.data).toMatchObject({ paymentStatus: "PAID", canPay: false, invoiceNo: "LC-000001" });
    expect(after.body.data.payments[0]).toMatchObject({ method: "CASH", amount: "450.00" });
  });

  it("numbers invoices one after another", async () => {
    const second = await payOrder(shop.cashier.token, (await newOrder()).id, "UPI");
    expect(second.invoiceNo).toBe("LC-000002");
    const third = await payOrder(shop.cashier.token, (await newOrder()).id, "CARD");
    expect(third.invoiceNo).toBe("LC-000003");
  });

  it("refuses cash that does not cover the bill, or no amount, and leaves the order unpaid", async () => {
    const order = await newOrder();
    for (const amountReceived of ["449.99", "0", "abc", "-5", "1.234", undefined]) {
      const res = await pay(order.id, "CASH", amountReceived);
      expect(res.status, String(amountReceived)).toBe(400);
      expect(res.body.error.code).toBe("INVALID_PAYMENT");
    }
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.paymentStatus).toBe("UNPAID");
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("ignores an 'amount received' for UPI, card and other", async () => {
    for (const method of ["UPI", "CARD", "OTHER"]) {
      const order = await newOrder();
      const res = await pay(order.id, method, "999");
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ method, amount: "450.00", amountReceived: null, changeGiven: "0.00" });
    }
  });

  it("the amount always comes from the order, never from the request", async () => {
    const order = await newOrder();
    const res = await cashier().post("/payments", { orderId: order.id, method: "UPI", amount: "1.00", idempotencyKey: uuid() });
    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe("450.00");
  });

  it("a free order (100% discount) needs no payment and still gets an invoice", async () => {
    const order = await newOrder(1, { discount: { type: "percent", value: "100" } });
    expect(order.grandTotal).toBe("0.00");
    const res = await pay(order.id, "OTHER");
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ amount: "0.00", amountReceived: null, changeGiven: "0.00" });
    expect(res.body.data.invoiceNo).toMatch(/^LC-\d{6}$/);
  });

  it("the same request twice records one payment and returns the same invoice", async () => {
    const order = await newOrder();
    const key = uuid();
    const first = await pay(order.id, "CASH", "500", key);
    const second = await pay(order.id, "CASH", "500", key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.invoiceNo).toBe(first.body.data.invoiceNo);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(1);

    // A request key cannot be borrowed for a different order
    const other2 = await newOrder();
    const reused = await pay(other2.id, "CASH", "500", key);
    expect(reused.status).toBe(409);
    expect(reused.body.error.code).toBe("KEY_REUSED");
  });

  it("an order cannot be paid twice, with a new request key", async () => {
    const order = await newOrder();
    await payOrder(shop.cashier.token, order.id, "UPI");
    const again = await pay(order.id, "UPI");
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_PAID");
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("two people paying the same order at once: one succeeds, one invoice, one payment", async () => {
    const order = await newOrder();
    const invoices = await prisma.invoice.count({ where: { shopId: shop.id } });
    const counter = (await prisma.settings.findUnique({ where: { shopId: shop.id } }))!.nextInvoiceNumber;

    const results = await Promise.all([pay(order.id, "UPI"), api(shop.owner.token).post("/payments", { orderId: order.id, method: "CARD", idempotencyKey: uuid() })]);

    expect(sortedStatuses(results)).toEqual([201, 409]);
    expect(["ALREADY_PAID", "ORDER_CHANGED"]).toContain(results.find((r) => r.status === 409)!.body.error.code);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.invoice.count({ where: { shopId: shop.id } })).toBe(invoices + 1);
    expect((await prisma.settings.findUnique({ where: { shopId: shop.id } }))!.nextInvoiceNumber).toBe(counter + 1);
  });

  it("two identical requests at once (a retry while saving) both get the same payment", async () => {
    const order = await newOrder();
    const key = uuid();
    const results = await Promise.all([pay(order.id, "UPI", undefined, key), pay(order.id, "UPI", undefined, key)]);

    expect(sortedStatuses(results)).toEqual([200, 201]);
    expect(results[0].body.data.invoiceNo).toBe(results[1].body.data.invoiceNo);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("refuses a cancelled order, an unknown order, another cafe's order, and a manager", async () => {
    const order = await newOrder();
    await cashier().patch(`/orders/${order.id}/status`, { status: "CANCELLED" });
    const cancelled = await pay(order.id, "UPI");
    expect(cancelled.status).toBe(409);
    expect(cancelled.body.error.code).toBe("ORDER_CANCELLED");

    expect((await pay(uuid(), "UPI")).body.error.code).toBe("ORDER_NOT_FOUND");

    const fresh = await newOrder();
    const foreign = await api(other.cashier.token).post("/payments", { orderId: fresh.id, method: "UPI", idempotencyKey: uuid() });
    expect(foreign.status).toBe(404);
    const manager = await api(shop.manager.token).post("/payments", { orderId: fresh.id, method: "UPI", idempotencyKey: uuid() });
    expect(manager.status).toBe(403);
  });

  it("the payments list adds up by method", async () => {
    const res = await cashier().get(`/payments?from=${today()}&to=${today()}`);
    expect(res.status).toBe(200);
    const { byMethod, collected } = res.body.data.summary;
    expect(byMethod.map((m: { method: string }) => m.method)).toEqual(["CASH", "UPI", "CARD", "OTHER"]);
    expect(byMethod.reduce((sum: number, m: { total: string }) => sum + paise(m.total), 0)).toBe(paise(collected));
    expect(res.body.data.items.length).toBeGreaterThan(0);
  });
});

describe("invoices", () => {
  let shop: TestShop;
  let other: TestShop;
  beforeAll(async () => {
    shop = await createShop("invoices");
    other = await createShop("invoices-other");
  });

  it("an invoice has everything on it, and is a real PDF", async () => {
    const cat = await makeCategory(shop.id, "Menu");
    const latte = await makeProduct(shop.id, cat.id, { name: "Invoice Latte", price: "150.00", gst: "5.00" });
    const order = await placeOrder(shop.cashier.token, {
      items: [{ productId: latte.id, quantity: 2 }],
      discount: { type: "amount", value: "30" },
      orderType: "DINE_IN",
      tableNo: "7",
    });
    const paid = await payOrder(shop.cashier.token, order.id, "CASH", "500");

    const res = await api(shop.cashier.token).get(`/invoices/${paid.invoiceId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      invoiceNo: paid.invoiceNo,
      voided: false,
      subtotal: "300.00",
      discount: "30.00",
      tax: "13.50",
      grandTotal: "283.50",
      cashier: shop.cashier.name,
    });
    expect(res.body.data.shop.name).toBe(shop.name);
    expect(res.body.data.settings.footer).toBe("Thank you for visiting Leo Cafe!");
    expect(res.body.data.order).toMatchObject({ orderNo: order.orderNo, orderType: "DINE_IN", tableNo: "7" });
    expect(res.body.data.items[0]).toMatchObject({ name: "Invoice Latte", quantity: 2, unitPrice: "150.00", amount: "300.00" });
    expect(res.body.data.payment).toMatchObject({ method: "CASH", amount: "283.50", amountReceived: "500.00", changeGiven: "216.50" });

    const pdf = await download(shop.cashier.token, `/invoices/${paid.invoiceId}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.headers["content-disposition"]).toContain(`${paid.invoiceNo}.pdf`);
    expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");

    const list = await api(shop.cashier.token).get(`/invoices?q=${paid.invoiceNo}`);
    expect(list.body.data.total).toBe(1);
  });

  it("uses the invoice prefix from Settings, for new invoices only", async () => {
    const cat = await makeCategory(shop.id, "Prefix");
    const item = await makeProduct(shop.id, cat.id, { price: "100.00", gst: "0.00" });
    const before = await payOrder(shop.cashier.token, (await placeOrder(shop.cashier.token, { items: [{ productId: item.id, quantity: 1 }] })).id);

    await api(shop.owner.token).put("/settings/billing", { invoicePrefix: "tst", defaultGst: "5", defaultDiscount: "0" });
    const after = await payOrder(shop.cashier.token, (await placeOrder(shop.cashier.token, { items: [{ productId: item.id, quantity: 1 }] })).id);

    expect(after.invoiceNo).toMatch(/^TST-\d{6}$/);
    const number = (text: string) => Number(text.split("-")[1]);
    expect(number(after.invoiceNo)).toBe(number(before.invoiceNo) + 1); // the counter carries on
    expect((await api(shop.cashier.token).get(`/invoices/${before.invoiceId}`)).body.data.invoiceNo).toBe(before.invoiceNo);
  });

  it("refunds: only an owner or manager can cancel a paid order; stock returns and the invoice is voided", async () => {
    const cat = await makeCategory(shop.id, "Refunds");
    const item = await makeProduct(shop.id, cat.id, { price: "200.00", gst: "5.00", stock: 10 });
    const order = await placeOrder(shop.cashier.token, { items: [{ productId: item.id, quantity: 2 }] });
    const paid = await payOrder(shop.cashier.token, order.id, "UPI");
    expect(await stockOf(item.id)).toBe(8);

    const refused = await api(shop.cashier.token).patch(`/orders/${order.id}/status`, { status: "CANCELLED" });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("REFUND_NOT_ALLOWED");
    expect(await stockOf(item.id)).toBe(8);

    const refunded = await api(shop.owner.token).patch(`/orders/${order.id}/status`, { status: "CANCELLED" });
    expect(refunded.status).toBe(200);
    expect(refunded.body.data).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUNDED" });
    expect(refunded.body.data.payments[0].refundedAt).toBeTruthy();
    expect(await stockOf(item.id)).toBe(10);

    expect((await api(shop.cashier.token).get(`/invoices/${paid.invoiceId}`)).body.data.voided).toBe(true);
    expect(await prisma.auditLog.count({ where: { shopId: shop.id, action: "ORDER_REFUNDED" } })).toBeGreaterThanOrEqual(1);

    const again = await api(shop.cashier.token).post("/payments", { orderId: order.id, method: "UPI", idempotencyKey: uuid() });
    expect(again.body.error.code).toBe("ORDER_CANCELLED");

    // A manager may refund too
    const second = await placeOrder(shop.cashier.token, { items: [{ productId: item.id, quantity: 1 }] });
    await payOrder(shop.cashier.token, second.id, "CARD");
    const byManager = await api(shop.manager.token).patch(`/orders/${second.id}/status`, { status: "CANCELLED" });
    expect(byManager.body.data.paymentStatus).toBe("REFUNDED");
  });

  it("another cafe, and a manager, cannot open invoices", async () => {
    const cat = await makeCategory(shop.id, "Private");
    const item = await makeProduct(shop.id, cat.id);
    const paid = await payOrder(shop.cashier.token, (await placeOrder(shop.cashier.token, { items: [{ productId: item.id, quantity: 1 }] })).id);

    const intruder = api(other.owner.token);
    expect((await intruder.get(`/invoices/${paid.invoiceId}`)).status).toBe(404);
    expect((await download(other.owner.token, `/invoices/${paid.invoiceId}/pdf`)).status).toBe(404);
    expect((await api(shop.manager.token).get(`/invoices/${paid.invoiceId}`)).status).toBe(403);
    expect((await intruder.get("/invoices")).body.data.total).toBe(0);
  });
});
