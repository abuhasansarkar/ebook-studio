"use client";

import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  basePath: "/api/v1/auth",
  plugins: [emailOTPClient()],
});

export const { useSession, signOut } = authClient;
