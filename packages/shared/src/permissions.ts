import { getUser, getMenuPermissions } from "./api";
import { MenuGroup } from "./menu";

export const PERM_NONE = 0;
export const PERM_VIEW = 1;
export const PERM_EDIT = 2;

export function isMaster(): boolean {
  return getUser()?.role_code === "MASTER";
}

// Longest-prefix match against the stored menu-permission map, mirroring the
// same longest-prefix idiom services/gateway-service/internal/domain/gateway.go
// (Match) and the shell's own sectionActive already use.
function bestMatch(perms: Record<string, number>, pathname: string): string | null {
  let best: string | null = null;
  for (const key of Object.keys(perms)) {
    if ((pathname === key || pathname.startsWith(key + "/")) && (!best || key.length > best.length)) {
      best = key;
    }
  }
  return best;
}

export function menuLevel(menuKey: string): number {
  if (isMaster()) return PERM_EDIT;
  return getMenuPermissions()[menuKey] ?? PERM_NONE;
}

export function hasRouteAccess(pathname: string): boolean {
  if (isMaster()) return true;
  const perms = getMenuPermissions();
  const key = bestMatch(perms, pathname);
  return key ? perms[key] > PERM_NONE : false;
}

// Reusable pattern for gating a Cadastros screen's edit UI. Not a real React
// hook (no internal state) — safe to call conditionally or in a loop, e.g. once
// per row while rendering a permission matrix. Named with the `use` prefix only
// by convention, matching how call sites read:
//
//   const perm = usePermission("/config/cadastros/usuarios");
//   ...
//   columns={[...baseColumns, ...(perm.canEdit ? [actionsColumn] : [])]}
//   form={perm.canEdit ? <form>...</form> : <p className="muted">Somente leitura para o seu perfil.</p>}
export function usePermission(menuKey: string) {
  const level = menuLevel(menuKey);
  return { level, canView: level >= PERM_VIEW, canEdit: level >= PERM_EDIT };
}

export function filterMenu(groups: MenuGroup[]): MenuGroup[] {
  if (isMaster()) return groups;
  const perms = getMenuPermissions();
  const walk = (gs: MenuGroup[]): MenuGroup[] =>
    gs
      .map((g) => {
        const items = g.items?.filter((i) => (perms[i.to] ?? PERM_NONE) > PERM_NONE);
        const subGroups = g.groups ? walk(g.groups) : undefined;
        return { ...g, items, groups: subGroups };
      })
      .filter((g) => (g.items && g.items.length > 0) || (g.groups && g.groups.length > 0));
  return walk(groups);
}
