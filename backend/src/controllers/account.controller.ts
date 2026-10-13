import type { RequestHandler } from "express";
import { getRequestContext } from "../services/audit.service";
import * as accountService from "../services/account.service";
import { REFRESH_COOKIE } from "../utils/tokens";

export const get: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await accountService.getAccount(req.user!) });
};

export const updateProfile: RequestHandler = async (req, res) => {
  const data = await accountService.updateProfile(req.user!, req.body, getRequestContext(req));
  res.json({ success: true, data });
};

export const changePassword: RequestHandler = async (req, res) => {
  const result = await accountService.changePassword(
    req.user!,
    req.body,
    req.cookies?.[REFRESH_COOKIE],
    getRequestContext(req)
  );
  res.json({ success: true, data: { message: "Password changed.", ...result } });
};
