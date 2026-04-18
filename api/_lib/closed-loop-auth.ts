export type ClosedLoopAccessLevel = "read" | "review" | "write";

const DEFAULT_ALLOWED_ROLES: Record<ClosedLoopAccessLevel, string[]> = {
  read: ["analyst", "reviewer", "operator", "manager", "admin"],
  review: ["reviewer", "operator", "admin"],
  write: ["operator", "admin"],
};

const readHeaderValue = (request: any, headerName: string) => {
  const headers = request?.headers;
  if (!headers) return "";

  if (typeof headers.get === "function") {
    return String(headers.get(headerName) || "").trim();
  }

  const matchedKey = Object.keys(headers).find(
    (key) => key.toLowerCase() === headerName.toLowerCase(),
  );
  const value = matchedKey ? headers[matchedKey] : undefined;

  if (Array.isArray(value)) {
    return String(value[0] || "").trim();
  }

  return String(value || "").trim();
};

const extractBearerToken = (authorization: string) => {
  const matched = authorization.match(/^Bearer\s+(.+)$/i);
  return matched?.[1]?.trim() || "";
};

const parseRoles = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const readPresentedToken = (request: any) => {
  const authorization = readHeaderValue(request, "authorization");
  return (
    extractBearerToken(authorization) ||
    readHeaderValue(request, "x-api-key") ||
    readHeaderValue(request, "x-closed-loop-token")
  );
};

const readPresentedRoles = (request: any) => {
  const multiRoles = parseRoles(readHeaderValue(request, "x-user-roles"));
  const singleRole = parseRoles(readHeaderValue(request, "x-user-role"));
  return [...new Set([...multiRoles, ...singleRole])];
};

const parseConfiguredRoles = (envName: string, fallback: string[]) => {
  const configured = parseRoles(process.env[envName] || "");
  return configured.length > 0 ? configured : fallback;
};

const readAllowedRoles = (accessLevel: ClosedLoopAccessLevel) => {
  if (accessLevel === "write") {
    return parseConfiguredRoles(
      "CLOSED_LOOP_WRITE_ROLES",
      DEFAULT_ALLOWED_ROLES.write,
    );
  }

  if (accessLevel === "review") {
    return parseConfiguredRoles(
      "CLOSED_LOOP_REVIEW_ROLES",
      DEFAULT_ALLOWED_ROLES.review,
    );
  }

  return parseConfiguredRoles(
    "CLOSED_LOOP_READ_ROLES",
    DEFAULT_ALLOWED_ROLES.read,
  );
};

const isStrictAuthRequired = () => {
  const explicit = String(process.env.CLOSED_LOOP_REQUIRE_AUTH || "").trim();
  if (explicit === "1") return true;
  if (explicit === "0") return false;
  return process.env.NODE_ENV === "production";
};

const sendAuthError = (response: any, statusCode: number, message: string) => {
  response.status(statusCode).json({ error: message });
};

export const ensureClosedLoopApiAccess = (
  request: any,
  response: any,
  accessLevel: ClosedLoopAccessLevel,
) => {
  const configuredToken = String(process.env.CLOSED_LOOP_API_TOKEN || "").trim();

  if (!configuredToken) {
    if (isStrictAuthRequired()) {
      sendAuthError(
        response,
        503,
        "闭环接口未配置鉴权令牌，请联系管理员配置 CLOSED_LOOP_API_TOKEN。",
      );
      return false;
    }

    return true;
  }

  const presentedToken = readPresentedToken(request);
  if (!presentedToken) {
    sendAuthError(response, 401, "缺少闭环接口访问令牌。");
    return false;
  }

  if (presentedToken !== configuredToken) {
    sendAuthError(response, 401, "闭环接口访问令牌无效。");
    return false;
  }

  const presentedRoles = readPresentedRoles(request);
  if (presentedRoles.length === 0) {
    sendAuthError(
      response,
      403,
      "缺少角色信息，请提供 x-user-role 或 x-user-roles。",
    );
    return false;
  }

  const allowedRoles = readAllowedRoles(accessLevel);
  const hasAllowedRole = presentedRoles.some((role) =>
    allowedRoles.includes(role),
  );

  if (!hasAllowedRole) {
    sendAuthError(response, 403, "当前角色无权访问该闭环接口。");
    return false;
  }

  return true;
};
