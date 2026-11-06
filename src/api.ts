import { API_CANDIDATES } from './config';

export type Role = 'admin' | 'building_owner' | 'building_manager' | 'store_owner';

export type AccountUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string | null;
  tenantName?: string | null;
  status: string;
  createdAt: string;
  storeCount?: number;
  areaIds?: string[];
};

export type AdminOverview = {
  users: { total: number; admin: number; buildingOwner: number; buildingManager: number; storeOwner: number };
  buildings: number;
};

export type TenantOverview = {
  tenant: { id: string; name: string; subdomain: string; status: string; createdAt: string };
  usage: {
    buildings: number;
    managers: number;
    storeOwners: number;
    floors: number;
    publishedFloors: number;
    stores: number;
    activePromotions: number;
  };
};

export type Building = {
  id: string;
  name: string;
  address: string | null;
  status: string;
  floorCount: number;
  createdAt: string;
};

export type StoreStatus = 'PENDING' | 'ACTIVE' | 'CLOSED';

export type Store = {
  id: string;
  name: string;
  description: string | null;
  status: StoreStatus;
};

export type Promotion = {
  id: string;
  storeId: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  status: 'ACTIVE' | 'INACTIVE';
};

export type PromotionInput = Pick<Promotion, 'title' | 'startAt' | 'endAt' | 'status'> & { description?: string };

export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;
let activeBase: string | null = null;

/** Called once after login; `expired` runs when the backend rejects the token (401). */
export function setSession(token: string | null, expired?: () => void) {
  accessToken = token;
  onSessionExpired = expired ?? null;
}

async function request(base: string, path: string, method: Method, body?: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Calls the backend and returns the `data` of its `{ success, data, error }` envelope. Only network failures try the next base URL. */
export async function api<T>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
  const bases = activeBase ? [activeBase, ...API_CANDIDATES.filter((b) => b !== activeBase)] : API_CANDIDATES;
  let res: Response | null = null;
  for (const base of bases) {
    try {
      res = await request(base, path, method, body);
      activeBase = base;
      break;
    } catch {
      // network error: try the next candidate
    }
  }
  if (!res) throw new ApiError('Không kết nối được máy chủ SpotWay. Kiểm tra mạng rồi thử lại.', 'NETWORK_ERROR', 0);

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && accessToken) onSessionExpired?.();
    const raw = json?.error?.message;
    const message = Array.isArray(raw) ? raw.join(', ') : raw;
    throw new ApiError(message ?? 'Yêu cầu thất bại. Vui lòng thử lại.', json?.error?.code ?? 'REQUEST_FAILED', res.status);
  }
  return (json && typeof json === 'object' && 'data' in json ? json.data : json) as T;
}

const items = <T>(page: { items: T[] } | T[]): T[] => (Array.isArray(page) ? page : page.items);

// ── Account ──
export const updateProfile = (name: string) => api<AccountUser>('/auth/profile', 'PATCH', { name });
export const changePassword = (currentPassword: string, newPassword: string) =>
  api<unknown>('/auth/change-password', 'POST', { currentPassword, newPassword });

// ── Admin ──
export const getAdminOverview = () => api<AdminOverview>('/admin/overview');
export const getAdminUsers = () => api<AccountUser[]>('/admin/users');
export const createAdminUser = (payload: { email: string; password: string; role: Exclude<Role, 'admin'>; ownerId?: string }) =>
  api<AccountUser>('/admin/users', 'POST', payload);
export const resetAdminUserPassword = (id: string) =>
  api<AccountUser & { temporaryPassword?: string }>(`/admin/users/${id}/reset-password`, 'POST', {});
export const deleteAdminUser = (id: string) => api<unknown>(`/admin/users/${id}`, 'DELETE');

// ── Building Owner ──
export const getTenantOverview = () => api<TenantOverview>('/tenant/overview');
export const getTenantUsers = () => api<AccountUser[]>('/tenant/users');
export const createTenantUser = (payload: { email: string; name?: string; role: 'building_manager' | 'store_owner'; areaIds?: string[] }) =>
  api<AccountUser & { temporaryPassword: string }>('/tenant/users', 'POST', payload);
export const resetTenantUserPassword = (id: string) =>
  api<AccountUser & { temporaryPassword?: string }>(`/tenant/users/${id}`, 'PATCH', { resetPassword: true });
export const deleteTenantUser = (id: string) => api<unknown>(`/tenant/users/${id}`, 'DELETE');

export const getBuildings = async () => items(await api<{ items: Building[] } | Building[]>('/buildings'));
export const createBuilding = (payload: { name: string; address?: string }) => api<Building>('/buildings', 'POST', payload);
export const deleteBuilding = (id: string) => api<unknown>(`/buildings/${id}`, 'DELETE');
export const assignManagerByEmail = (buildingId: string, email: string) =>
  api<unknown>(`/buildings/${buildingId}/managers/by-email`, 'POST', { email });

// ── Building Manager: store owners ──
export const getStoreOwners = () => api<AccountUser[]>('/store-owners');
export const createStoreOwner = (payload: { email: string; name?: string }) =>
  api<AccountUser & { temporaryPassword: string }>('/store-owners', 'POST', payload);
export const resetStoreOwnerPassword = (id: string) =>
  api<AccountUser & { temporaryPassword?: string }>(`/store-owners/${id}/reset-password`, 'POST', {});
export const deleteStoreOwner = (id: string) => api<unknown>(`/store-owners/${id}`, 'DELETE');

// ── Store Owner ──
export const getStores = async () => items(await api<{ items: Store[] } | Store[]>('/stores'));
export const updateStore = (id: string, payload: Partial<Pick<Store, 'name' | 'description' | 'status'>>) =>
  api<Store>(`/stores/${id}`, 'PATCH', payload);
export const getPromotions = (storeId: string) => api<Promotion[]>(`/stores/${storeId}/promotions`);
export const createPromotion = (storeId: string, payload: PromotionInput) =>
  api<Promotion>(`/stores/${storeId}/promotions`, 'POST', payload);
export const updatePromotion = (id: string, payload: Partial<PromotionInput>) =>
  api<Promotion>(`/promotions/${id}`, 'PATCH', payload);
export const deletePromotion = (id: string) => api<unknown>(`/promotions/${id}`, 'DELETE');
