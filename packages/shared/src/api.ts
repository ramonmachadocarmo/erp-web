import type { Quote } from "@erp/schema";

export type User = {
  id: string;
  email: string;
  name: string;
  role_id: string;
  role_code: string;
  role_name: string;
};

const TOKEN = "erp_token";
const REFRESH = "erp_refresh";
const USER = "erp_user";
const MENU_PERMS = "erp_menu_perms";

export function getToken() {
  return localStorage.getItem(TOKEN);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH);
}

export function getUser(): User | null {
  const raw = localStorage.getItem(USER);
  return raw ? JSON.parse(raw) : null;
}

export function getMenuPermissions(): Record<string, number> {
  const raw = localStorage.getItem(MENU_PERMS);
  return raw ? JSON.parse(raw) : {};
}

export function setSession(token: string, user: User, menuPermissions?: Record<string, number>, refreshToken?: string) {
  localStorage.setItem(TOKEN, token);
  localStorage.setItem(USER, JSON.stringify(user));
  if (menuPermissions) localStorage.setItem(MENU_PERMS, JSON.stringify(menuPermissions));
  if (refreshToken) localStorage.setItem(REFRESH, refreshToken);
}

export function clearSession() {
  localStorage.removeItem(TOKEN);
  localStorage.removeItem(REFRESH);
  localStorage.removeItem(USER);
  localStorage.removeItem(MENU_PERMS);
}

// The access token is a short-lived JWT (minutes); a rotating refresh token renews it silently.
function tokenExpiresSoon(token: string, skewSeconds = 30): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" && payload.exp * 1000 - Date.now() < skewSeconds * 1000;
  } catch {
    return false;
  }
}

type RefreshResult = "ok" | "denied" | "error";
let refreshing: Promise<RefreshResult> | null = null;

// One refresh at a time per tab (concurrent requests share it). "denied" means the server
// refused the refresh token (expired, revoked, reused) — the only case that ends the session;
// a network failure ("error") keeps it so a flaky connection doesn't log anyone out.
function refreshAccessToken(): Promise<RefreshResult> {
  if (refreshing) return refreshing;
  refreshing = (async (): Promise<RefreshResult> => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return "denied";
    try {
      const res = await fetch("/api/identity/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (res.status === 401 || res.status === 400) return "denied";
      if (!res.ok) return "error";
      const body = await res.json();
      localStorage.setItem(TOKEN, body.token);
      if (body.refresh_token) localStorage.setItem(REFRESH, body.refresh_token);
      if (body.user) localStorage.setItem(USER, JSON.stringify(body.user));
      if (body.menu_permissions) localStorage.setItem(MENU_PERMS, JSON.stringify(body.menu_permissions));
      return "ok";
    } catch {
      return "error";
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

function endSession() {
  clearSession();
  if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
}

// fetch with the bearer token: renews the access token just before it expires, and once more
// (then retries) if the server still answers 401. Retrying after a 401 is safe — nothing ran.
async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (getRefreshToken()) {
    const current = getToken();
    if (current && tokenExpiresSoon(current)) {
      if ((await refreshAccessToken()) === "denied") endSession();
    }
  }
  const send = () => {
    const headers = new Headers(init.headers);
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(url, { ...init, headers });
  };
  let res = await send();
  if (res.status === 401 && getRefreshToken()) {
    const outcome = await refreshAccessToken();
    if (outcome === "ok") res = await send();
    else if (outcome === "denied") endSession();
  }
  if (res.status === 401) endSession();
  return res;
}

async function request<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await authedFetch(`${base}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body as T;
}

export const identityApi = {
  login: (email: string, password: string) =>
    request<{ token: string; refresh_token: string; expires_in: number; user: User; menu_permissions: Record<string, number> }>("/api/identity", "/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<void>("/api/identity", "/auth/logout", { method: "POST" }),
  me: () => request<User>("/api/identity", "/auth/me"),
  users: () => request<User[]>("/api/identity", "/users"),
  createUser: (body: unknown) =>
    request<User>("/api/identity", "/users", { method: "POST", body: JSON.stringify(body) }),
  updateUser: (id: string, body: unknown) =>
    request<User>("/api/identity", `/users/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteUser: (id: string) => request<void>("/api/identity", `/users/${id}`, { method: "DELETE" }),
};

export type Role = { id: string; code: string; name: string; is_master: boolean; is_system: boolean };
export type ModulePermission = { module: string; level: number };
export type MenuPermission = { menu_key: string; level: number };

export const rolesApi = {
  list: () => request<Role[]>("/api/identity", "/roles"),
  create: (body: unknown) => request<Role>("/api/identity", "/roles", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: unknown) => request<Role>("/api/identity", `/roles/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  delete: (id: string) => request<void>("/api/identity", `/roles/${id}`, { method: "DELETE" }),
  permissions: (id: string) =>
    request<{ modules: ModulePermission[]; menus: MenuPermission[] }>("/api/identity", `/roles/${id}/permissions`),
  setPermissions: (id: string, body: { modules: ModulePermission[]; menus: MenuPermission[] }) =>
    request<void>("/api/identity", `/roles/${id}/permissions`, { method: "PUT", body: JSON.stringify(body) }),
};

export const configApi = {
  units: () => request<any[]>("/api/config", "/units"),
  createUnit: (body: unknown) => request<any>("/api/config", "/units", { method: "POST", body: JSON.stringify(body) }),
  updateUnit: (id: string, body: unknown) => request<any>("/api/config", `/units/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  customers: () => request<any[]>("/api/config", "/customers"),
  createCustomer: (body: unknown) => request<any>("/api/config", "/customers", { method: "POST", body: JSON.stringify(body) }),
  updateCustomer: (id: string, body: unknown) => request<any>("/api/config", `/customers/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteCustomer: (id: string) => request<void>("/api/config", `/customers/${id}`, { method: "DELETE" }),
  suppliers: () => request<any[]>("/api/config", "/suppliers"),
  createSupplier: (body: unknown) => request<any>("/api/config", "/suppliers", { method: "POST", body: JSON.stringify(body) }),
  updateSupplier: (id: string, body: unknown) => request<any>("/api/config", `/suppliers/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteSupplier: (id: string) => request<void>("/api/config", `/suppliers/${id}`, { method: "DELETE" }),
  lookupCep: (cep: string) => request<any>("/api/config", `/cep/${cep.replace(/\D/g, "")}`),
  searchCep: (p: { state: string; city: string; street: string; district?: string }) =>
    request<any[]>("/api/config", `/cep?${new URLSearchParams({ state: p.state, city: p.city, street: p.street, district: p.district ?? "" })}`),
  lookupGeo: (lat: number, lng: number) => request<any>("/api/config", `/geo?lat=${lat}&lng=${lng}`),
  searchGeo: (q: string) => request<any>("/api/config", `/geo?q=${encodeURIComponent(q)}`),
  centers: () => request<any[]>("/api/config", "/centers"),
  createCenter: (body: unknown) => request<any>("/api/config", "/centers", { method: "POST", body: JSON.stringify(body) }),
  updateCenter: (id: string, body: unknown) => request<any>("/api/config", `/centers/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  vehicles: () => request<any[]>("/api/config", "/vehicles"),
  createVehicle: (body: unknown) => request<any>("/api/config", "/vehicles", { method: "POST", body: JSON.stringify(body) }),
  updateVehicle: (id: string, body: unknown) => request<any>("/api/config", `/vehicles/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  settings: () => request<any[]>("/api/config", "/settings"),
  setting: (key: string) => request<any>("/api/config", `/settings/${key}`),
  putSetting: (key: string, value: string) =>
    request<any>("/api/config", `/settings/${key}`, { method: "PUT", body: JSON.stringify({ value }) }),
  paymentMethods: () => request<any[]>("/api/config", "/payment-methods"),
  createPaymentMethod: (body: unknown) =>
    request<any>("/api/config", "/payment-methods", { method: "POST", body: JSON.stringify(body) }),
  updatePaymentMethod: (id: string, body: unknown) =>
    request<any>("/api/config", `/payment-methods/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  paymentTerms: () => request<any[]>("/api/config", "/payment-terms"),
  createPaymentTerm: (body: unknown) =>
    request<any>("/api/config", "/payment-terms", { method: "POST", body: JSON.stringify(body) }),
  updatePaymentTerm: (id: string, body: unknown) =>
    request<any>("/api/config", `/payment-terms/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  company: () => request<any>("/api/config", "/company"),
  updateCompany: (body: unknown) => request<any>("/api/config", "/company", { method: "PUT", body: JSON.stringify(body) }),
};

export const stockApi = {
  products: () => request<any[]>("/api/stock", "/products"),
  createProduct: (body: unknown) => request<any>("/api/stock", "/products", { method: "POST", body: JSON.stringify(body) }),
  updateProduct: (id: string, body: unknown) => request<any>("/api/stock", `/products/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteProduct: (id: string) => request<void>("/api/stock", `/products/${id}`, { method: "DELETE" }),
  categories: () => request<any[]>("/api/stock", "/categories"),
  createCategory: (body: unknown) => request<any>("/api/stock", "/categories", { method: "POST", body: JSON.stringify(body) }),
  updateCategory: (id: string, body: unknown) => request<any>("/api/stock", `/categories/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteCategory: (id: string) => request<void>("/api/stock", `/categories/${id}`, { method: "DELETE" }),
  warehouses: () => request<any[]>("/api/stock", "/warehouses"),
  createWarehouse: (body: unknown) => request<any>("/api/stock", "/warehouses", { method: "POST", body: JSON.stringify(body) }),
  updateWarehouse: (id: string, body: unknown) => request<any>("/api/stock", `/warehouses/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  balances: () => request<any[]>("/api/stock", "/balances"),
  setBalance: (body: unknown) => request<any>("/api/stock", "/balances", { method: "PUT", body: JSON.stringify(body) }),
  movements: () => request<any[]>("/api/stock", "/movements"),
  openReservations: (productId: string) => request<any[]>("/api/stock", `/reservations?product_id=${encodeURIComponent(productId)}`),
  createMovement: (body: unknown) => request<any>("/api/stock", "/movements", { method: "POST", body: JSON.stringify(body) }),
  transferStock: (body: unknown) => request<any>("/api/stock", "/movements/transfer", { method: "POST", body: JSON.stringify(body) }),
  salePrices: (productId?: string) =>
    request<any[]>("/api/stock", `/prices/sale${productId ? `?product_id=${productId}` : ""}`),
  createSalePrice: (body: unknown) =>
    request<any>("/api/stock", "/prices/sale", { method: "POST", body: JSON.stringify(body) }),
  purchasePrices: (productId?: string) =>
    request<any[]>("/api/stock", `/prices/purchase${productId ? `?product_id=${productId}` : ""}`),
  createPurchasePrice: (body: unknown) =>
    request<any>("/api/stock", "/prices/purchase", { method: "POST", body: JSON.stringify(body) }),
  assemblies: () => request<any[]>("/api/stock", "/assemblies"),
  createAssembly: (body: unknown) =>
    request<any>("/api/stock", "/assemblies", { method: "POST", body: JSON.stringify(body) }),
  updateAssembly: (id: string, body: unknown) =>
    request<any>("/api/stock", `/assemblies/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  recalculateAssembly: (id: string) =>
    request<any>("/api/stock", `/assemblies/${id}/recalculate`, { method: "POST" }),
  applyAssemblyPrice: (id: string) =>
    request<any>("/api/stock", `/assemblies/${id}/apply-price`, { method: "POST" }),
};

export const salesApi = {
  orders: () => request<any[]>("/api/sales", "/sales-orders"),
  getOrder: (id: string) => request<any>("/api/sales", `/sales-orders/${id}`),
  createOrder: (body: unknown) => request<any>("/api/sales", "/sales-orders", { method: "POST", body: JSON.stringify(body) }),
  updateOrder: (id: string, body: unknown) =>
    request<any>("/api/sales", `/sales-orders/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  cancelOrder: (id: string) => request<void>("/api/sales", `/sales-orders/${id}/cancel`, { method: "POST" }),
  deleteOrder: (id: string) => request<void>("/api/sales", `/sales-orders/${id}`, { method: "DELETE" }),
  setPaymentStatus: (id: string, status: string) =>
    request<void>("/api/sales", `/sales-orders/${id}/payment-status`, { method: "PUT", body: JSON.stringify({ status }) }),
  scanPick: (id: string, body: unknown) =>
    request<any>("/api/sales", `/sales-orders/${id}/picking/scan`, { method: "POST", body: JSON.stringify(body) }),
  completePicking: (id: string, volumeCount: number) =>
    request<any>("/api/sales", `/sales-orders/${id}/picking/complete`, { method: "POST", body: JSON.stringify({ volume_count: volumeCount }) }),
  bypassPicking: (id: string, body: { volume_count: number; reason?: string; approver_email?: string; approver_password?: string }) =>
    request<any>("/api/sales", `/sales-orders/${id}/picking/bypass`, { method: "POST", body: JSON.stringify(body) }),
  undoPicking: (id: string) =>
    request<void>("/api/sales", `/sales-orders/${id}/picking/undo`, { method: "POST" }),
  deliver: (id: string) =>
    request<void>("/api/sales", `/sales-orders/${id}/deliver`, { method: "POST" }),
  failDelivery: (id: string, note: string) =>
    request<void>("/api/sales", `/sales-orders/${id}/fail`, { method: "POST", body: JSON.stringify({ note }) }),
  undoDeliver: (id: string) =>
    request<void>("/api/sales", `/sales-orders/${id}/undeliver`, { method: "POST" }),
  deliveryCandidates: () => request<any[]>("/api/sales", "/delivery-candidates"),
  deliveryPlans: () => request<any[]>("/api/sales", "/delivery-plans"),
  getDeliveryPlan: (id: string) => request<any>("/api/sales", `/delivery-plans/${id}`),
  createDeliveryPlans: (body: unknown) =>
    request<any>("/api/sales", "/delivery-plans", { method: "POST", body: JSON.stringify(body) }),
  confirmDeliveryPlan: (id: string, body: unknown) =>
    request<any>("/api/sales", `/delivery-plans/${id}/confirm`, { method: "POST", body: JSON.stringify(body) }),
};

export const purchasingApi = {
  suppliers: () => configApi.suppliers(),
  createSupplier: (body: unknown) => configApi.createSupplier(body),
  updateSupplier: (id: string, body: unknown) => configApi.updateSupplier(id, body),
  orders: () => request<any[]>("/api/purchasing", "/purchase-orders"),
  createOrder: (body: unknown) => request<any>("/api/purchasing", "/purchase-orders", { method: "POST", body: JSON.stringify(body) }),
  updateOrder: (id: string, body: unknown) =>
    request<any>("/api/purchasing", `/purchase-orders/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteOrder: (id: string) => request<void>("/api/purchasing", `/purchase-orders/${id}`, { method: "DELETE" }),
  cancelOrder: (id: string) => request<void>("/api/purchasing", `/purchase-orders/${id}/cancel`, { method: "POST" }),
  setOrderPaymentStatus: (id: string, status: "PENDING" | "PAID") =>
    request<void>("/api/purchasing", `/purchase-orders/${id}/payment-status`, { method: "PUT", body: JSON.stringify({ status }) }),
  setOrderDeliveryStatus: (id: string, status: "APPROVED" | "CONFERRED") =>
    request<void>("/api/purchasing", `/purchase-orders/${id}/delivery-status`, { method: "PUT", body: JSON.stringify({ status }) }),
  receive: (id: string, body?: unknown) =>
    request<void>("/api/purchasing", `/purchase-orders/${id}/receive`, { method: "POST", body: JSON.stringify(body || {}) }),
  confer: (id: string) =>
    request<void>("/api/purchasing", `/purchase-orders/${id}/confer`, { method: "POST" }),
  quotes: () => request<Quote[]>("/api/purchasing", "/quotes"),
  createQuote: (body: Quote) => request<Quote>("/api/purchasing", "/quotes", { method: "POST", body: JSON.stringify(body) }),
  updateQuote: (id: string, body: Quote) =>
    request<Quote>("/api/purchasing", `/quotes/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteQuote: (id: string) => request<void>("/api/purchasing", `/quotes/${id}`, { method: "DELETE" }),
  convertQuote: (id: string, body: unknown) =>
    request<any>("/api/purchasing", `/quotes/${id}/convert`, { method: "POST", body: JSON.stringify(body) }),
  compareQuotes: (ids: string[]) =>
    request<any>("/api/purchasing", "/quotes/compare", { method: "POST", body: JSON.stringify({ ids }) }),
};

export const assetsApi = {
  assets: () => request<any[]>("/api/assets", "/assets"),
  create: (body: unknown) => request<any>("/api/assets", "/assets", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: unknown) => request<any>("/api/assets", `/assets/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  get: (id: string) => request<any>("/api/assets", `/assets/${id}`),
  transfer: (id: string, body: unknown) =>
    request<any>("/api/assets", `/assets/${id}/transfer`, { method: "POST", body: JSON.stringify(body) }),
  depreciate: (id: string, asOf?: string) =>
    request<any>("/api/assets", `/assets/${id}/depreciate`, {
      method: "POST",
      body: JSON.stringify(asOf ? { as_of: asOf } : {}),
    }),
  depreciateAll: (asOf?: string) =>
    request<any[]>("/api/assets", "/assets/depreciate", {
      method: "POST",
      body: JSON.stringify(asOf ? { as_of: asOf } : {}),
    }),
  dispose: (id: string, notes?: string) =>
    request<any>("/api/assets", `/assets/${id}/dispose`, { method: "POST", body: JSON.stringify({ notes: notes || "" }) }),
  movements: (assetId?: string) =>
    request<any[]>("/api/assets", assetId ? `/assets/${assetId}/movements` : "/movements"),
};

export const cashflowApi = {
  entries: () => request<any[]>("/api/cashflow", "/entries"),
  summary: () => request<any[]>("/api/cashflow", "/summary"),
  createManual: (body: any) => request<any>("/api/cashflow", "/entries", { method: "POST", body: JSON.stringify(body) }),
  deleteEntry: (id: string) => request<void>("/api/cashflow", `/entries/${id}`, { method: "DELETE" }),
};

export const biApi = {
  scenarios: () => request<any[]>("/api/bi", "/scenarios"),
  createScenario: (body: unknown) => request<any>("/api/bi", "/scenarios", { method: "POST", body: JSON.stringify(body) }),
  scenario: (id: string) => request<any>("/api/bi", `/scenarios/${id}`),
  updateScenario: (id: string, body: unknown) => request<any>("/api/bi", `/scenarios/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteScenario: (id: string) => request<void>("/api/bi", `/scenarios/${id}`, { method: "DELETE" }),
  duplicateScenario: (id: string, name: string) => request<any>("/api/bi", `/scenarios/${id}/duplicate`, { method: "POST", body: JSON.stringify({ name }) }),
  setScenarioLine: (id: string, kind: string, targetId: string, weeklyQty: number | null) =>
    request<any>("/api/bi", `/scenarios/${id}/lines/${kind}/${targetId}`, { method: "PUT", body: JSON.stringify({ weekly_qty: weeklyQty }) }),
  removeScenarioLine: (id: string, kind: string, targetId: string) =>
    request<any>("/api/bi", `/scenarios/${id}/lines/${kind}/${targetId}`, { method: "DELETE" }),
  resetScenario: (id: string) => request<any>("/api/bi", `/scenarios/${id}/reset`, { method: "POST" }),
  importRealScenario: (id: string) => request<any>("/api/bi", `/scenarios/${id}/import-real`, { method: "POST" }),
  undoScenario: (id: string) => request<any>("/api/bi", `/scenarios/${id}/undo`, { method: "POST" }),
  redoScenario: (id: string) => request<any>("/api/bi", `/scenarios/${id}/redo`, { method: "POST" }),
  forecasts: (lookbackWeeks?: number, includeExcluded?: boolean) => {
    const q = new URLSearchParams();
    if (lookbackWeeks) q.set("lookback_weeks", String(lookbackWeeks));
    if (includeExcluded) q.set("include_excluded", "true");
    const qs = q.toString();
    return request<any[]>("/api/bi", `/forecasts${qs ? `?${qs}` : ""}`);
  },
  setForecastOverride: (kind: string, targetId: string, body: unknown) =>
    request<any>("/api/bi", `/forecasts/${kind}/${targetId}`, { method: "PUT", body: JSON.stringify(body) }),
  clearForecastOverride: (kind: string, targetId: string) =>
    request<void>("/api/bi", `/forecasts/${kind}/${targetId}`, { method: "DELETE" }),
  excludeForecast: (kind: string, targetId: string) =>
    request<void>("/api/bi", `/forecasts/${kind}/${targetId}/exclude`, { method: "POST" }),
  includeForecast: (kind: string, targetId: string) =>
    request<void>("/api/bi", `/forecasts/${kind}/${targetId}/exclude`, { method: "DELETE" }),
  financials: (lookbackWeeks?: number) =>
    request<any[]>("/api/bi", `/financials${lookbackWeeks ? `?lookback_weeks=${lookbackWeeks}` : ""}`),
  storagePlan: (params: { coverage_weeks?: number; safety_percent?: number; lookback_weeks?: number }) => {
    const q = new URLSearchParams();
    if (params.coverage_weeks != null) q.set("coverage_weeks", String(params.coverage_weeks));
    if (params.safety_percent != null) q.set("safety_percent", String(params.safety_percent));
    if (params.lookback_weeks != null) q.set("lookback_weeks", String(params.lookback_weeks));
    const qs = q.toString();
    return request<any[]>("/api/bi", `/storage-plan${qs ? `?${qs}` : ""}`);
  },
  budgets: () => request<any[]>("/api/bi", "/budgets"),
  createBudget: (body: unknown) => request<any>("/api/bi", "/budgets", { method: "POST", body: JSON.stringify(body) }),
  getBudget: (id: string) => request<any>("/api/bi", `/budgets/${id}`),
  deleteBudget: (id: string) => request<void>("/api/bi", `/budgets/${id}`, { method: "DELETE" }),
  updateBudgetItem: (budgetId: string, itemId: string, body: unknown) =>
    request<any>("/api/bi", `/budgets/${budgetId}/items/${itemId}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteBudgetItem: (budgetId: string, itemId: string) =>
    request<void>("/api/bi", `/budgets/${budgetId}/items/${itemId}`, { method: "DELETE" }),
  addAllocation: (budgetId: string, itemId: string, body: unknown) =>
    request<any>("/api/bi", `/budgets/${budgetId}/items/${itemId}/allocations`, { method: "POST", body: JSON.stringify(body) }),
  deleteAllocation: (budgetId: string, allocationId: string) =>
    request<void>("/api/bi", `/budgets/${budgetId}/allocations/${allocationId}`, { method: "DELETE" }),
  confirmBudget: (id: string) => request<any>("/api/bi", `/budgets/${id}/confirm`, { method: "POST" }),
  cancelBudget: (id: string) => request<void>("/api/bi", `/budgets/${id}/cancel`, { method: "POST" }),
  supplierPrices: () => request<any[]>("/api/bi", "/supplier-prices"),
  setSupplierPrice: (body: unknown) => request<any>("/api/bi", "/supplier-prices", { method: "POST", body: JSON.stringify(body) }),
  deleteSupplierPrice: (id: string) => request<void>("/api/bi", `/supplier-prices/${id}`, { method: "DELETE" }),
  schedules: () => request<any[]>("/api/bi", "/schedules"),
  createSchedule: (body: unknown) => request<any>("/api/bi", "/schedules", { method: "POST", body: JSON.stringify(body) }),
  updateSchedule: (id: string, body: unknown) =>
    request<any>("/api/bi", `/schedules/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteSchedule: (id: string) => request<void>("/api/bi", `/schedules/${id}`, { method: "DELETE" }),
  runScheduleNow: (id: string) => request<any>("/api/bi", `/schedules/${id}/run-now`, { method: "POST" }),
};

export const invoicingApi = {
  invoices: (direction?: string) =>
    request<any[]>("/api/invoicing", `/invoices${direction ? `?direction=${direction}` : ""}`),
  issue: (id: string) => request<any>("/api/invoicing", `/invoices/${id}/issue`, { method: "POST" }),
  confirm: (id: string, body: unknown) =>
    request<any>("/api/invoicing", `/invoices/${id}/confirm`, { method: "POST", body: JSON.stringify(body) }),
  document: (id: string) => request<any>("/api/invoicing", `/invoices/${id}/document`),
  deleteInvoice: (id: string) => request<void>("/api/invoicing", `/invoices/${id}`, { method: "DELETE" }),
  importFile: async (direction: string, file?: File | null, purchaseOrderId?: string, withoutNote?: boolean) => {
    const body = new FormData();
    body.append("direction", direction);
    if (purchaseOrderId) body.append("purchase_order_id", purchaseOrderId);
    if (withoutNote) body.append("without_note", "true");
    if (file && file.size) body.append("file", file);
    const res = await authedFetch("/api/invoicing/invoices/import", { method: "POST", body });
    const data = await res.json().catch(() => ({ error: res.statusText }));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  },
};

export const reportsApi = {
  kits: () => request<any[]>("/api/reports", "/kits"),
  stock: (warehouseId?: string) =>
    request<any[]>("/api/reports", `/stock${warehouseId ? `?warehouse_id=${warehouseId}` : ""}`),
  sales: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const qs = q.toString();
    return request<any[]>("/api/reports", `/sales${qs ? `?${qs}` : ""}`);
  },
  purchases: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const qs = q.toString();
    return request<any[]>("/api/reports", `/purchases${qs ? `?${qs}` : ""}`);
  },
  customerRanking: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const qs = q.toString();
    return request<any[]>("/api/reports", `/customer-ranking${qs ? `?${qs}` : ""}`);
  },
  productSales: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const qs = q.toString();
    return request<any[]>("/api/reports", `/product-sales${qs ? `?${qs}` : ""}`);
  },
  forecast: (params: { coverage_weeks?: number; safety_percent?: number; lookback_weeks?: number }) => {
    const q = new URLSearchParams();
    if (params.coverage_weeks != null) q.set("coverage_weeks", String(params.coverage_weeks));
    if (params.safety_percent != null) q.set("safety_percent", String(params.safety_percent));
    if (params.lookback_weeks != null) q.set("lookback_weeks", String(params.lookback_weeks));
    const qs = q.toString();
    return request<any[]>("/api/reports", `/forecast${qs ? `?${qs}` : ""}`);
  },
  losses: (params: { from?: string; to?: string; product_id?: string; warehouse_id?: string }) => {
    const q = new URLSearchParams();
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
    if (params.product_id) q.set("product_id", params.product_id);
    if (params.warehouse_id) q.set("warehouse_id", params.warehouse_id);
    const qs = q.toString();
    return request<any[]>("/api/reports", `/losses${qs ? `?${qs}` : ""}`);
  },
  cashflow: (params: { from?: string; to?: string; direction?: string; status?: string; overdue?: boolean }) => {
    const q = new URLSearchParams();
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
    if (params.direction) q.set("direction", params.direction);
    if (params.status) q.set("status", params.status);
    if (params.overdue) q.set("overdue", "true");
    const qs = q.toString();
    return request<any[]>("/api/reports", `/cashflow${qs ? `?${qs}` : ""}`);
  },
  cashflowTimeline: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const qs = q.toString();
    return request<any[]>("/api/reports", `/cashflow-timeline${qs ? `?${qs}` : ""}`);
  },
};

export type AuditLogEntry = {
  id: string;
  at: string;
  method: string;
  module: string;
  path: string;
  status_code: number;
  user_email: string;
  user_role: string;
  body?: string;
};

// Matches pkg/pagination.Page[T] on the Go side — the shared envelope for any paginated
// GET list endpoint, not just audit logs.
export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

export const auditApi = {
  logs: (params?: { module?: string; method?: string; user_email?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.module) q.set("module", params.module);
    if (params?.method) q.set("method", params.method);
    if (params?.user_email) q.set("user_email", params.user_email);
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.limit != null) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<Page<AuditLogEntry>>("/api/audit", `/logs${qs ? `?${qs}` : ""}`);
  },
};
