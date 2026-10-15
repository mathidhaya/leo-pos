import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  api,
  cleanupAll,
  createShop,
  createUser,
  makeCategory,
  makeProduct,
  orderBody,
  phone,
  placeOrder,
  prisma,
  sortedStatuses,
  stockOf,
  today,
  uuid,
  type TestShop,
} from "./helpers";

afterAll(cleanupAll);

async function nextOrderNumber(shopId: string): Promise<number> {
  return (await prisma.settings.findUnique({ where: { shopId } }))!.nextOrderNumber;
}

describe("creating orders", () => {
  let shop: TestShop;
  let other: TestShop;
  let latte: { id: string };
  let cake: { id: string };
  const cashier = () => api(shop.cashier.token);

  beforeAll(async () => {
    shop = await createShop("orders");
    other = await createShop("orders-other");
    const cat = await makeCategory(shop.id, "Menu");
    latte = await makeProduct(shop.id, cat.id, { name: "Latte", price: "100.00", cost: "40.00", gst: "5.00", stock: 50 });
    cake = await makeProduct(shop.id, cat.id, { name: "Cake", price: "200.00", cost: "120.00", gst: "18.00", stock: 10 });
  });

  it("saves a dine-in order, copies the prices, takes the stock, and numbers it", async () => {
    const before = await stockOf(latte.id);
    const key = uuid();
    const res = await cashier().post(
      "/orders",
      orderBody({ items: [{ productId: latte.id, quantity: 2 }], orderType: "DINE_IN", tableNo: "T4", guests: 3 }, "210.00", key)
    );
    expect(res.status).toBe(201);

    const order = res.body.data;
    expect(order).toMatchObject({
      orderNo: 1, // the first order of a new cafe
      status: "PENDING",
      paymentStatus: "UNPAID",
      orderType: "DINE_IN",
      tableNo: "T4",
      guests: 3,
      grandTotal: "210.00",
      canPay: true,
      cashier: shop.cashier.name,
    });
    expect(order.items[0]).toMatchObject({ name: "Latte", quantity: 2, unitPrice: "100.00", gstPercent: "5.00", tax: "10.00", total: "210.00" });

    // Stock went down, and the history says why
    expect(await stockOf(latte.id)).toBe(before - 2);
    const sale = await prisma.inventoryTransaction.findFirst({ where: { orderId: order.id } });
    expect(sale).toMatchObject({ type: "SALE", quantityChange: -2, productId: latte.id });
    expect(sale!.reason).toMatch(/^Order #/);

    // The cost price is kept on the order line (for profit), and prices never change afterwards
    const line = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
    expect(line!.costPrice.toFixed(2)).toBe("40.00");
    await prisma.product.update({ where: { id: latte.id }, data: { sellingPrice: "999.00", name: "Renamed" } });
    const later = await cashier().get(`/orders/${order.id}`);
    expect(later.body.data.items[0]).toMatchObject({ name: "Latte", unitPrice: "100.00", total: "210.00" });
    await prisma.product.update({ where: { id: latte.id }, data: { sellingPrice: "100.00", name: "Latte" } });

    expect(await prisma.auditLog.count({ where: { shopId: shop.id, action: "ORDER_CREATED" } })).toBeGreaterThanOrEqual(1);
  });

  it("numbers orders one after another", async () => {
    const first = await placeOrder(shop.cashier.token, { items: [{ productId: latte.id, quantity: 1 }] });
    const second = await placeOrder(shop.cashier.token, { items: [{ productId: latte.id, quantity: 1 }] });
    expect(second.orderNo).toBe(first.orderNo + 1);
  });

  it("returns the same order when the same request is sent twice, and takes the stock only once", async () => {
    const before = await stockOf(latte.id);
    const orders = await prisma.order.count({ where: { shopId: shop.id } });
    const body = orderBody({ items: [{ productId: latte.id, quantity: 2 }] }, "210.00");

    const first = await cashier().post("/orders", body);
    const second = await cashier().post("/orders", body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);

    expect(await stockOf(latte.id)).toBe(before - 2);
    expect(await prisma.order.count({ where: { shopId: shop.id } })).toBe(orders + 1);
  });

  it("refuses a total the cashier did not see, and changes nothing", async () => {
    const stock = await stockOf(latte.id);
    const orders = await prisma.order.count({ where: { shopId: shop.id } });
    const number = await nextOrderNumber(shop.id);

    const res = await cashier().post("/orders", orderBody({ items: [{ productId: latte.id, quantity: 1 }] }, "1.00"));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TOTAL_CHANGED");

    expect(await stockOf(latte.id)).toBe(stock);
    expect(await prisma.order.count({ where: { shopId: shop.id } })).toBe(orders);
    expect(await nextOrderNumber(shop.id)).toBe(number); // the order number was not used up
  });

  it("refuses more than the stock, and changes nothing", async () => {
    const stock = await stockOf(cake.id);
    const orders = await prisma.order.count({ where: { shopId: shop.id } });
    const number = await nextOrderNumber(shop.id);

    const res = await cashier().post("/orders", orderBody({ items: [{ productId: cake.id, quantity: stock + 1 }] }, "1.00"));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("CART_UNAVAILABLE");

    expect(await stockOf(cake.id)).toBe(stock);
    expect(await prisma.order.count({ where: { shopId: shop.id } })).toBe(orders);
    expect(await nextOrderNumber(shop.id)).toBe(number);
  });

  it("needs name, phone and address for delivery, and adds the delivery charge", async () => {
    const items = [{ productId: latte.id, quantity: 1 }];
    const missing = await cashier().post("/orders", orderBody({ items, orderType: "DELIVERY", deliveryCharge: "30" }, "135.00"));
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("VALIDATION_ERROR");

    const mobile = phone();
    const ok = await cashier().post(
      "/orders",
      orderBody(
        { items, orderType: "DELIVERY", deliveryCharge: "30", customerName: "Asha Rao", customerPhone: mobile, address: "12 Park Street" },
        "135.00"
      )
    );
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({
      orderType: "DELIVERY",
      deliveryCharge: "30.00",
      grandTotal: "135.00",
      deliveryAddress: "12 Park Street",
      customerName: "Asha Rao",
      customerPhone: mobile,
    });
  });

  it("finds or creates the customer from the phone number, and keeps the name already saved", async () => {
    const mobile = phone();
    const formatted = `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}`;
    const items = [{ productId: latte.id, quantity: 1 }];

    await placeOrder(shop.cashier.token, { items, customerName: "First Name", customerPhone: formatted });
    await placeOrder(shop.cashier.token, { items, customerName: "Other Name", customerPhone: mobile });

    const customers = await prisma.customer.findMany({ where: { shopId: shop.id, phone: mobile } });
    expect(customers).toHaveLength(1);
    expect(customers[0].name).toBe("First Name");
    expect(await prisma.order.count({ where: { shopId: shop.id, customerId: customers[0].id } })).toBe(2);
  });

  it("uses 'Guest' for a phone number with no name, and keeps a walk-in name without creating a customer", async () => {
    const mobile = phone();
    const items = [{ productId: latte.id, quantity: 1 }];
    await placeOrder(shop.cashier.token, { items, customerPhone: mobile });
    expect((await prisma.customer.findFirst({ where: { shopId: shop.id, phone: mobile } }))!.name).toBe("Guest");

    const customers = await prisma.customer.count({ where: { shopId: shop.id } });
    const walkIn = await placeOrder(shop.cashier.token, { items, customerName: "Walk In Wendy" });
    expect(walkIn.customerName).toBe("Walk In Wendy");
    expect(await prisma.customer.count({ where: { shopId: shop.id } })).toBe(customers);
  });

  it("refuses a take-away order with a phone number that is not a mobile number", async () => {
    const res = await cashier().post(
      "/orders",
      orderBody({ items: [{ productId: latte.id, quantity: 1 }], customerPhone: "12345" }, "105.00")
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("only the owner and cashiers take orders", async () => {
    const body = orderBody({ items: [{ productId: latte.id, quantity: 1 }] }, "105.00");
    expect((await api(shop.manager.token).post("/orders", body)).status).toBe(403);
    expect((await api(shop.owner.token).post("/orders", orderBody({ items: [{ productId: latte.id, quantity: 1 }] }, "105.00"))).status).toBe(201);
    // another cafe cannot sell this cafe's product
    const foreign = await api(other.cashier.token).post("/orders", orderBody({ items: [{ productId: latte.id, quantity: 1 }] }, "105.00"));
    expect(foreign.status).toBe(422);
  });
});

describe("order status and cancelling", () => {
  let shop: TestShop;
  let other: TestShop;
  let item: { id: string };
  const cashier = () => api(shop.cashier.token);

  beforeAll(async () => {
    shop = await createShop("status");
    other = await createShop("status-other");
    const cat = await makeCategory(shop.id, "Menu");
    item = await makeProduct(shop.id, cat.id, { name: "Status Item", price: "100.00", gst: "5.00", stock: 20 });
  });

  it("moves forward only, and tells the cashier what is allowed", async () => {
    const order = await placeOrder(shop.cashier.token, { items: [{ productId: item.id, quantity: 1 }] });
    expect(order.actions).toEqual(["PREPARING", "READY", "COMPLETED", "CANCELLED"]);

    const preparing = await cashier().patch(`/orders/${order.id}/status`, { status: "PREPARING" });
    expect(preparing.status).toBe(200);
    expect(preparing.body.data.status).toBe("PREPARING");

    const back = await cashier().patch(`/orders/${order.id}/status`, { status: "PENDING" });
    expect(back.status).toBe(409);
    expect(back.body.error.code).toBe("INVALID_STATUS_CHANGE");

    // Steps can be skipped
    const done = await cashier().patch(`/orders/${order.id}/status`, { status: "COMPLETED" });
    expect(done.body.data.status).toBe("COMPLETED");
    expect(done.body.data.actions).toEqual([]);
    expect((await cashier().patch(`/orders/${order.id}/status`, { status: "CANCELLED" })).status).toBe(409);
  });

  it("cancelling an unpaid order gives the stock back, once", async () => {
    const before = await stockOf(item.id);
    const order = await placeOrder(shop.cashier.token, { items: [{ productId: item.id, quantity: 3 }] });
    expect(await stockOf(item.id)).toBe(before - 3);

    const cancelled = await cashier().patch(`/orders/${order.id}/status`, { status: "CANCELLED" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("CANCELLED");
    expect(await stockOf(item.id)).toBe(before);

    const returned = await prisma.inventoryTransaction.findFirst({ where: { orderId: order.id, type: "IN" } });
    expect(returned).toMatchObject({ quantityChange: 3 });
    expect(returned!.reason).toContain("cancelled");

    // Cancelling again changes nothing
    expect((await cashier().patch(`/orders/${order.id}/status`, { status: "CANCELLED" })).status).toBe(200);
    expect(await stockOf(item.id)).toBe(before);
  });

  it("lists and filters orders, and searches by number, name or phone", async () => {
    const mobile = phone();
    const found = await placeOrder(shop.cashier.token, {
      items: [{ productId: item.id, quantity: 1 }],
      orderType: "DELIVERY",
      deliveryCharge: "10",
      customerName: "Searchable Sam",
      customerPhone: mobile,
      address: "1 Test Road",
    });
    const range = `from=${today()}&to=${today()}`;
    const ids = async (query: string) => (await cashier().get(`/orders?${range}${query}`)).body.data.items.map((o: { id: string }) => o.id);

    expect(await ids("")).toContain(found.id);
    expect(await ids("&q=searchable")).toEqual([found.id]);
    expect(await ids(`&q=${mobile.slice(2, 8)}`)).toEqual([found.id]);
    expect(await ids(`&q=${found.orderNo}`)).toContain(found.id);
    expect(await ids("&orderType=DELIVERY")).toEqual([found.id]);
    expect(await ids("&orderType=DINE_IN")).not.toContain(found.id);
    expect(await ids("&status=PENDING&payment=UNPAID")).toContain(found.id);
    expect(await ids("&status=COMPLETED")).not.toContain(found.id);
    expect(await ids("&q=%25")).toEqual([]);

    expect((await cashier().get("/orders?from=2026-01-01")).status).toBe(400); // both dates, or neither
  });

  it("another cafe cannot see or move this cafe's orders", async () => {
    const order = await placeOrder(shop.cashier.token, { items: [{ productId: item.id, quantity: 1 }] });
    const intruder = api(other.owner.token);
    const get = await intruder.get(`/orders/${order.id}`);
    expect(get.status).toBe(404);
    expect(get.body.error.code).toBe("ORDER_NOT_FOUND");
    expect((await intruder.patch(`/orders/${order.id}/status`, { status: "CANCELLED" })).status).toBe(404);
    expect((await intruder.get("/orders")).body.data.total).toBe(0);
  });

  it("a manager can view orders and move them along, but cannot take them", async () => {
    const order = await placeOrder(shop.cashier.token, { items: [{ productId: item.id, quantity: 1 }] });
    const manager = api(shop.manager.token);
    expect((await manager.get(`/orders/${order.id}`)).status).toBe(200);
    expect((await manager.patch(`/orders/${order.id}/status`, { status: "READY" })).body.data.status).toBe("READY");
  });
});

describe("many people at the same moment", () => {
  let shop: TestShop;
  let cat: { id: string };
  beforeAll(async () => {
    shop = await createShop("races");
    cat = await makeCategory(shop.id, "Menu");
  });

  it("only one of four people can buy the last item", async () => {
    const last = await makeProduct(shop.id, cat.id, { name: "Last Slice", price: "100.00", gst: "5.00", stock: 1 });
    const second = await createUser(shop.id, "CASHIER", "cashier2");
    const tokens = [shop.cashier.token, shop.owner.token, second.token, shop.cashier.token];

    const results = await Promise.all(
      tokens.map((token) => api(token).post("/orders", orderBody({ items: [{ productId: last.id, quantity: 1 }] }, "105.00")))
    );

    expect(sortedStatuses(results)).toEqual([201, 422, 422, 422]);
    for (const res of results.filter((r) => r.status === 422)) expect(res.body.error.code).toBe("CART_UNAVAILABLE");

    expect(await stockOf(last.id)).toBe(0);
    expect(await prisma.inventoryTransaction.count({ where: { productId: last.id, type: "SALE" } })).toBe(1);
    expect(await prisma.orderItem.count({ where: { productId: last.id } })).toBe(1);
  });

  it("eight orders at once get eight different, consecutive numbers", async () => {
    const plenty = await makeProduct(shop.id, cat.id, { name: "Plenty", price: "100.00", gst: "5.00", stock: 50 });
    const before = await nextOrderNumber(shop.id);

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        api(shop.cashier.token).post("/orders", orderBody({ items: [{ productId: plenty.id, quantity: 1 }] }, "105.00"))
      )
    );

    expect(results.every((r) => r.status === 201)).toBe(true);
    const numbers = results.map((r) => r.body.data.orderNo as number).sort((x, y) => x - y);
    expect(new Set(numbers).size).toBe(8);
    expect(numbers[7] - numbers[0]).toBe(7);
    expect(await nextOrderNumber(shop.id)).toBe(before + 8);
    expect(await stockOf(plenty.id)).toBe(42);
  });

  it("a double-click saves one order, and both clicks get it", async () => {
    const dbl = await makeProduct(shop.id, cat.id, { name: "Double Click", price: "100.00", gst: "5.00", stock: 20 });
    const body = orderBody({ items: [{ productId: dbl.id, quantity: 2 }] }, "210.00");
    const before = await nextOrderNumber(shop.id);

    const results = await Promise.all([api(shop.cashier.token).post("/orders", body), api(shop.cashier.token).post("/orders", body)]);

    expect(sortedStatuses(results)).toEqual([200, 201]);
    expect(results[0].body.data.id).toBe(results[1].body.data.id);
    expect(await prisma.order.count({ where: { shopId: shop.id, idempotencyKey: body.idempotencyKey } })).toBe(1);
    expect(await stockOf(dbl.id)).toBe(18);
    expect(await nextOrderNumber(shop.id)).toBe(before + 1);
  });
});
