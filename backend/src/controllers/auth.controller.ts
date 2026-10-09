import type { RequestHandler } from "express";
import { getRequestContext } from "../services/audit.service";
import * as authService from "../services/auth.service";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_COOKIE,
  clearRefreshCookie,
  setRefreshCookie,
} from "../utils/tokens";

// Controllers only handle the HTTP side. The real work lives in auth.service.ts.

export const sendOtp: RequestHandler = async (req, res) => {
  await authService.sendOtp(req.body.identifier, req.body.purpose);
  res.json({
    success: true,
    data: { message: "OTP sent. It is valid for 5 minutes.", expiresInSeconds: 300, resendAfterSeconds: 30 },
  });
};

export const forgotPassword: RequestHandler = async (req, res) => {
  await authService.sendOtp(req.body.identifier, "RESET");
  res.json({
    success: true,
    data: { message: "OTP sent. It is valid for 5 minutes.", expiresInSeconds: 300, resendAfterSeconds: 30 },
  });
};

export const verifyOtp: RequestHandler = async (req, res) => {
  const { verificationId } = await authService.verifyOtp(
    req.body.identifier,
    req.body.purpose,
    req.body.otp
  );
  res.json({ success: true, data: { message: "Verified", verificationId } });
};

export const register: RequestHandler = async (req, res) => {
  const session = await authService.register(req.body, getRequestContext(req));
  setRefreshCookie(res, session.refreshToken);
  res.status(201).json({
    success: true,
    data: {
      accessToken: session.accessToken,
      expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
      user: session.user,
    },
  });
};

export const login: RequestHandler = async (req, res) => {
  const session = await authService.login(req.body.identifier, req.body.password, getRequestContext(req));
  setRefreshCookie(res, session.refreshToken);
  res.json({
    success: true,
    data: {
      accessToken: session.accessToken,
      expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
      user: session.user,
    },
  });
};

export const refresh: RequestHandler = async (req, res) => {
  try {
    const session = await authService.refreshSession(req.cookies?.[REFRESH_COOKIE], getRequestContext(req));
    setRefreshCookie(res, session.refreshToken);
    res.json({
      success: true,
      data: {
        accessToken: session.accessToken,
        expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
        user: session.user,
      },
    });
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
};

export const logout: RequestHandler = async (req, res) => {
  await authService.logout(req.cookies?.[REFRESH_COOKIE], getRequestContext(req));
  clearRefreshCookie(res);
  res.json({ success: true, data: { message: "Logged out." } });
};

export const resetPassword: RequestHandler = async (req, res) => {
  await authService.resetPassword(req.body, getRequestContext(req));
  res.json({ success: true, data: { message: "Password updated. Please log in." } });
};

export const me: RequestHandler = async (req, res) => {
  const user = await authService.getProfile(req.user!.id);
  res.json({ success: true, data: { user } });
};
