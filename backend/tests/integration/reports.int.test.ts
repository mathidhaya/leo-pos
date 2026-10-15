import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, cleanupAll, createShop, download, makeCategory, makeProduct, paise, placeOrder, payOrder, today, type TestShop } from "./helpers";

afterAll(cleanupAll);

// THE SALES (all hand-calculated)
//   A "Report Coffee": 100.00, cost 40.00, GST 5%      B "Report Cake": 200.00, cost 120.00, GST 18%
//   O1  2 x A, UPI                              revenue 200, tax 10.00,  total 210.00
//   O2  1 x A + 1 x B, 10% off (30), cash       revenue 300, discount 30, tax 36.90 (4.50 + 32.40), total 306.90
//   O3  1 x B, delivery 30, card                revenue 200, tax 36.00,  delivery 30, total 266.00
//   O4  1 x A, unpaid                           (not counted)
//   O5  1 x A, paid, then refunded              (not counted: shown as a refund)
//   O6  1 x A, cancelled                        (not counted)
// COUNTED: 3 orders. Revenue 700 - discount 30 = net sales 670. GST 82.90. Delivery 30. Total sales 782.90.
//          Cost 80 + 160 + 120 = 360. Profit 670 - 360 = 310.

describe("reports", () => {
  let shop: TestShop;
  let other: TestShop;
  let a: { id: string };
  let b: { id: string };
  const range = () => `from=${today()}&to=${today()}`;
  const owner = () => api(shop.owner.token);

  beforeAll(async () => {
    shop = await createShop("reports");
    other = await createShop("reports-other");
    const drinks = await makeCategory(shop.id, "Report Drinks");
    const food = await makeCategory(shop.id, "Report Food");
    a = await makeProduct(shop.id, drinks.id, { name: "Report Coffee", price: "100.00", cost: "40.00", gst: "5.00" });
    b = await makeProduct(shop.id, food.id, { name: "Report Cake", price: "200.00", cost: "120.00", gst: "18.00" });

    const cashier = shop.cashier.token;
    const o1 = await placeOrder(cashier, { items: [{ productId: a.id, quantity: 2 }] });
    expect(o1.grandTotal).toBe("210.00");
    await payOrder(cashier, o1.id, "UPI");

    const o2 = await placeOrder(cashier, {
      items: [{ productId: a.id, quantity: 1 }, { productId: b.id, quantity: 1 }],
      discount: { type: "percent", value: "10" },
    });
    expect(o2.grandTotal).toBe("306.90");
    await payOrder(cashier, o2.id, "CASH", "400");

    const o3 = await placeOrder(cashier, {
      items: [{ productId: b.id, quantity: 1 }],
      orderType: "DELIVERY",
      deliveryCharge: "30",
      customerName: "Report Rita",
      customerPhone: "9876500000",
      address: "1 Report Road",
    });
    expect(o3.grandTotal).toBe("266.00");
    await payOrder(cashier, o3.id, "CARD");

    await placeOrder(cashier, { items: [{ productId: a.id, quantity: 1 }] }); // O4: unpaid

    const o5 = await placeOrder(cashier, { items: [{ productId: a.id, quantity: 1 }] });
    await payOrder(cashier, o5.id, "CASH", "105");
    expect((await owner().patch(`/orders/${o5.id}/status`, { status: "CANCELLED" })).body.data.paymentStatus).toBe("REFUNDED");

    const o6 = await placeOrder(cashier, { items: [{ productId: a.id, quantity: 1 }] });
    await api(cashier).patch(`/orders/${o6.id}/status`, { status: "CANCELLED" });
  });

  it("sales: every figure matches the hand calculation", async () => {
    const res = await owner().get(`/reports/sales?${range()}&groupBy=day`);
    expect(res.status).toBe(200);
    expect(res.body.data.summary).toEqual({
      orders: 3,
      total: "782.90",
      averageOrder: "260.97",
      revenue: "700.00",
      discount: "30.00",
      tax: "82.90",
      delivery: "30.00",
      profit: "310.00",
      unpaidOrders: 1,
      cancelledOrders: 2,
    });
    expect(res.body.data.series).toHaveLength(1);
    expect(res.body.data.series[0]).toMatchObject({ orders: 3, total: "782.90", profit: "310.00", tax: "82.90" });
  });

  it("the sales total follows the billing rule, and the rows add up", async () => {
    const { summary, series } = (await owner().get(`/reports/sales?${range()}&groupBy=day`)).body.data;
    expect(paise(summary.total)).toBe(paise(summary.revenue) - paise(summary.discount) + paise(summary.tax) + paise(summary.delivery));
    expect(series.reduce((sum: number, row: { total: string }) => sum + paise(row.total), 0)).toBe(paise(summary.total));
  });

  it("groups by week, month and year without changing the totals", async () => {
    for (const groupBy of ["week", "month", "year"]) {
      const res = await owner().get(`/reports/sales?${range()}&groupBy=${groupBy}`);
      expect(res.status, groupBy).toBe(200);
      const rows = res.body.data.series as Array<{ total: string }>;
      expect(rows.reduce((sum, row) => sum + paise(row.total), 0), groupBy).toBe(78290);
    }
  });

  it("shows empty days as zero, not as gaps", async () => {
    const res = await owner().get("/reports/sales?from=2020-01-01&to=2020-01-07&groupBy=day");
    expect(res.body.data.series).toHaveLength(7);
    expect(res.body.data.summary).toMatchObject({ orders: 0, total: "0.00", profit: "0.00" });
  });

  it("profit: revenue - discount - cost, and the margin", async () => {
    const res = await owner().get(`/reports/profit?${range()}&groupBy=day`);
    expect(res.body.data.summary).toEqual({
      revenue: "700.00",
      discount: "30.00",
      netSales: "670.00",
      tax: "82.90",
      cost: "360.00",
      profit: "310.00",
      marginPercent: 46.3,
    });
  });

  it("products: quantity, revenue, profit and margin of each, best seller first", async () => {
    const res = await owner().get(`/reports/products?${range()}`);
    const rows = res.body.data.rows as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.name)).toEqual(["Report Cake", "Report Coffee"]); // by money, after discount
    expect(rows[0]).toMatchObject({ quantity: 2, revenue: "400.00", discount: "20.00", cost: "240.00", profit: "140.00", marginPercent: 36.8 });
    expect(rows[1]).toMatchObject({ quantity: 3, revenue: "300.00", discount: "10.00", cost: "120.00", profit: "170.00", marginPercent: 58.6 });
    expect(res.body.data.totals).toEqual({ quantity: 5, revenue: "700.00", discount: "30.00", cost: "360.00", profit: "310.00" });
  });

  it("categories: the same figures, with each one's share of sales", async () => {
    const res = await owner().get(`/reports/categories?${range()}`);
    const rows = res.body.data.rows as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.name)).toEqual(["Report Food", "Report Drinks"]);
    expect(rows[0]).toMatchObject({ quantity: 2, profit: "140.00", sharePercent: 56.7 });
    expect(rows[1]).toMatchObject({ quantity: 3, profit: "170.00", sharePercent: 43.3 });
    expect(res.body.data.totals.profit).toBe("310.00");
  });

  it("payments: by method, and refunds shown separately", async () => {
    const res = await owner().get(`/reports/payments?${range()}`);
    const byMethod = Object.fromEntries(res.body.data.rows.map((r: { method: string }) => [r.method, r]));
    expect(byMethod.UPI).toMatchObject({ payments: 1, total: "210.00" });
    expect(byMethod.CASH).toMatchObject({ payments: 1, total: "306.90" });
    expect(byMethod.CARD).toMatchObject({ payments: 1, total: "266.00" });
    expect(byMethod.OTHER).toMatchObject({ payments: 0, total: "0.00" });
    expect(res.body.data.summary).toMatchObject({ collected: "782.90", payments: 3, refunds: { count: 1, total: "105.00" } });
  });

  it("every report agrees with every other, and with the dashboard", async () => {
    const [sales, profit, products, categories, payments, dashboard] = await Promise.all([
      owner().get(`/reports/sales?${range()}&groupBy=day`),
      owner().get(`/reports/profit?${range()}&groupBy=day`),
      owner().get(`/reports/products?${range()}`),
      owner().get(`/reports/categories?${range()}`),
      owner().get(`/reports/payments?${range()}`),
      owner().get("/dashboard?range=today"),
    ]);
    const profitOf = (rows: Array<{ profit: string }>) => rows.reduce((sum, row) => sum + paise(row.profit), 0);

    expect(paise(profit.body.data.summary.profit)).toBe(paise(sales.body.data.summary.profit));
    expect(profitOf(products.body.data.rows)).toBe(31000);
    expect(profitOf(categories.body.data.rows)).toBe(31000);
    expect(paise(payments.body.data.summary.collected)).toBe(paise(sales.body.data.summary.total));

    expect(dashboard.body.data.today).toMatchObject({ sales: "782.90", profit: "310.00", orders: 4, pending: 4, completed: 0, cancelled: 2 });
    expect(dashboard.body.data.topProducts[0]).toMatchObject({ name: "Report Coffee", quantity: 3, revenue: "290.00" });
  });

  it("exports CSV and PDF with the same numbers", async () => {
    const csv = await download(shop.owner.token, `/reports/export?report=sales&format=csv&${range()}&groupBy=day`);
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect([...csv.body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // so Excel reads it as UTF-8
    const text = csv.body.toString("utf8");
    expect(text).toContain("Report,Sales report");
    expect(text).toContain("Total,3,700.00,30.00,82.90,30.00,782.90,310.00");

    const pdf = await download(shop.owner.token, `/reports/export?report=profit&format=pdf&${range()}&groupBy=day`);
    expect(pdf.status).toBe(200);
    expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");

    const bad = await download(shop.owner.token, `/reports/export?report=secrets&format=csv&${range()}`);
    expect(bad.status).toBe(400);
  });

  it("refuses silly dates, and shows another cafe nothing of this one", async () => {
    expect((await owner().get("/reports/sales?from=2026-10-11&to=2026-10-01")).status).toBe(400);
    expect((await owner().get("/reports/sales?from=nope&to=2026-10-01")).status).toBe(400);
    expect((await owner().get("/reports/sales?from=2018-01-01&to=2026-10-01&groupBy=month")).status).toBe(400);

    const theirs = await api(other.owner.token).get(`/reports/sales?${range()}&groupBy=day`);
    expect(theirs.body.data.summary).toMatchObject({ orders: 0, total: "0.00", profit: "0.00" });
    expect((await api(other.owner.token).get(`/reports/products?${range()}`)).body.data.rows).toEqual([]);
  });

  it("a manager can read reports; a cashier cannot, and does not see profit on the dashboard", async () => {
    expect((await api(shop.manager.token).get(`/reports/sales?${range()}&groupBy=day`)).status).toBe(200);
    expect((await api(shop.cashier.token).get(`/reports/sales?${range()}&groupBy=day`)).status).toBe(403);
    expect((await api(shop.cashier.token).get(`/reports/export?report=sales&format=csv&${range()}`)).status).toBe(403);

    const dash = await api(shop.cashier.token).get("/dashboard?range=today");
    expect(dash.status).toBe(200);
    expect(dash.body.data.canViewProfit).toBe(false);
    expect(dash.body.data.today.profit).toBeNull();
  });
});
