import { afterAll, describe, expect, it } from "vitest";
import { createOwnerAccount, resetPasswordByLogin } from "../../src/services/owner.service";
import { cleanupAll, loginWith, phone, prisma, refreshWith, trackShop, uuid } from "./helpers";

afterAll(cleanupAll);

describe("creating the first owner from the command line", () => {
  it("makes the cafe, the owner, the categories and the settings, and the password works", async () => {
    const email = `first-owner-${uuid().slice(0, 8)}@leopos.test`;
    const created = await createOwnerAccount({ shopName: "  Command Line Cafe ", ownerName: "Asha Owner", identifier: email.toUpperCase() });
    trackShop(created.shopId);

    expect(created.login).toBe(email);
    expect(created.password).toHaveLength(12);

    const user = await prisma.user.findUnique({ where: { id: created.userId } });
    expect(user).toMatchObject({ role: "OWNER", email, isActive: true });
    expect(user!.passwordHash).not.toContain(created.password);
    expect((await prisma.shop.findUnique({ where: { id: created.shopId } }))!.name).toBe("Command Line Cafe");
    expect(await prisma.category.count({ where: { shopId: created.shopId } })).toBe(6);
    expect(await prisma.settings.count({ where: { shopId: created.shopId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { shopId: created.shopId, action: "SHOP_REGISTERED" } })).toBe(1);

    const login = await loginWith(email, created.password);
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe("OWNER");
  });

  it("works with a mobile number too, and refuses duplicates and bad input", async () => {
    const mobile = phone();
    const created = await createOwnerAccount({ shopName: "Mobile Cafe", ownerName: "Ravi Owner", identifier: `+91 ${mobile}` });
    trackShop(created.shopId);
    expect(created.login).toBe(mobile);

    await expect(createOwnerAccount({ shopName: "Again", ownerName: "Someone", identifier: mobile })).rejects.toMatchObject({
      code: "ALREADY_REGISTERED",
      statusCode: 409,
    });
    await expect(createOwnerAccount({ shopName: "Bad", ownerName: "Someone", identifier: "12345" })).rejects.toMatchObject({
      code: "INVALID_IDENTIFIER",
    });
    await expect(createOwnerAccount({ shopName: "X", ownerName: "Someone", identifier: phone() })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
});

describe("getting back in when nobody can log in", () => {
  it("gives a new password, ends every session, and the old password stops working", async () => {
    const email = `locked-out-${uuid().slice(0, 8)}@leopos.test`;
    const created = await createOwnerAccount({ shopName: "Locked Out Cafe", ownerName: "Locked Owner", identifier: email });
    trackShop(created.shopId);
    const session = await loginWith(email, created.password);
    expect(session.status).toBe(200);

    const reset = await resetPasswordByLogin(email);
    expect(reset).toMatchObject({ role: "OWNER", login: email });
    expect(reset.password).not.toBe(created.password);

    expect((await loginWith(email, created.password)).status).toBe(401);
    expect((await loginWith(email, reset.password)).status).toBe(200);
    expect((await refreshWith(session.cookie)).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { shopId: created.shopId, action: "PASSWORD_RESET" } })).toBe(1);
  });

  it("says so when the account does not exist", async () => {
    await expect(resetPasswordByLogin(`nobody-${uuid().slice(0, 8)}@leopos.test`)).rejects.toMatchObject({
      code: "USER_NOT_FOUND",
      statusCode: 404,
    });
  });
});
