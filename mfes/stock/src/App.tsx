import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Autocomplete, CadastroLayout, Category, CategoryForm, CodeInput, DataTable, DataTableColumn, InfoTooltip, Loading, Modal, ProductForm, ProductCreateModal, WarehouseCreateModal,
  biApi, categoryPath, categoryWithDescendants, configApi, flattenCats, stockApi,
} from "@erp/shared";

type Item = { product_id: string; quantity: number; role: string; unitPrice?: number };

function brl(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

const SUBTYPE_LABELS: Record<string, string> = { PURCHASE: "Compra", SALE: "Venda", LOSS: "Perda" };

const MOVE_SUBTYPES: Record<string, { value: string; label: string }[]> = {
  IN: [{ value: "PURCHASE", label: "Compra" }],
  OUT: [{ value: "SALE", label: "Venda" }, { value: "LOSS", label: "Perda" }],
};

function moveTypeLabel(t: string, subtype?: string) {
  const sub = subtype ? SUBTYPE_LABELS[subtype] : "";
  if (t === "MANUAL_IN") return sub ? `Entrada — ${sub}` : "Entrada manual";
  if (t === "MANUAL_OUT") return sub ? `Saída — ${sub}` : "Saída manual";
  if (t === "TRANSFER_OUT") return "Transferência — Saída";
  if (t === "TRANSFER_IN") return "Transferência — Entrada";
  if (t === "PURCHASE_IN") return "Entrada (compra)";
  if (t === "SALE_OUT") return "Saída (NFe)";
  if (t === "RESERVATION_ADD") return "Reserva";
  if (t === "RESERVATION_RELEASE") return "Libera reserva";
  return t;
}

function kindLabel(k: string) {
  if (k === "SUPPORT") return "Apoio";
  if (k === "FIXED_ASSET") return "Ativo fixo";
  return "Final";
}

function emptyItem(): Item {
  return { product_id: "", quantity: 1, role: "COMPONENT" };
}

function conversionLabel(p: any) {
  if (!p.purchase_uom || !p.sale_uom || p.purchase_uom === p.sale_uom) return "—";
  const c = (p.uom_conversions || []).find((x: any) => x.from_uom === p.purchase_uom && x.to_uom === p.sale_uom)
    || (p.uom_conversions || [])[0];
  if (!c) return "—";
  return `1 ${c.from_uom} = ${c.factor} ${c.to_uom}`;
}

function stockUom(p: any) {
  return p?.stock_uom || p?.sale_uom || p?.unit_of_measure || "";
}

function convertQty(qty: number, from: string, to: string, convs: any[]) {
  if (!from || !to || from === to) return qty;
  const c = (convs || []).find((x: any) =>
    (x.from_uom === from && x.to_uom === to) || (x.from_uom === to && x.to_uom === from)
  );
  if (!c?.factor) return null;
  if (c.from_uom === from && c.to_uom === to) return qty * c.factor;
  return qty / c.factor;
}

function personName(list: any[], id: string) {
  const p = list.find((x) => x.id === id);
  if (!p) return id;
  return p.kind === "PJ" ? p.company_name || p.name : p.name;
}

function matchesQuery(p: any, q: string, cat: string) {
  if (!q) return true;
  const n = q.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const blob = [p.sku, p.name, p.barcode, p.ncm, cat].join(" ");
  return blob.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().includes(n);
}

function CategoryNodes({
  nodes, onEdit, onDelete,
}: { nodes: Category[]; onEdit: (c: Category) => void; onDelete: (id: string) => void }) {
  return (
    <ul>
      {nodes.map((n) => (
        <li key={n.id}>
          <div className="tree-row">
            <span className="tree-name">{n.name}</span>
            <button type="button" className="secondary" onClick={() => onEdit(n)}>Editar</button>
            <button type="button" className="secondary" onClick={() => onDelete(n.id)}>Excluir</button>
          </div>
          {(n.children || []).length > 0 && <CategoryNodes nodes={n.children || []} onEdit={onEdit} onDelete={onDelete} />}
        </li>
      ))}
    </ul>
  );
}

const titles: Record<string, string> = {
  produtos: "Produtos",
  categorias: "Categorias",
  montagem: "Montagem",
  almoxarifados: "Almoxarifados",
  saldos: "Saldos",
  movimentos: "Movimentos",
  precos: "Preços de venda",
};

export default function App() {
  const page = useLocation().pathname.split("/").filter(Boolean).pop() || "produtos";
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [assemblies, setAssemblies] = useState<any[]>([]);
  const [saleHistory, setSaleHistory] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);
  const [pricingProduct, setPricingProduct] = useState<any>(null);
  const [pricingTab, setPricingTab] = useState<"set" | "suppliers" | "history">("set");
  const [pricingSaleHistory, setPricingSaleHistory] = useState<any[]>([]);
  const [pricingPurchaseHistory, setPricingPurchaseHistory] = useState<any[]>([]);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingAssembly, setEditingAssembly] = useState<any>(null);
  const [editingWarehouse, setEditingWarehouse] = useState<any>(null);
  const [editingBalance, setEditingBalance] = useState<any>(null);
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const [seedMarginPercent, setSeedMarginPercent] = useState(30);
  const [assemblyProductId, setAssemblyProductId] = useState("");
  const [moveDir, setMoveDir] = useState("");
  const [moveSub, setMoveSub] = useState("");
  const [moveFrom, setMoveFrom] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const [showOnlyActiveAssemblies, setShowOnlyActiveAssemblies] = useState(true);
  const [recalcAssembly, setRecalcAssembly] = useState<any>(null);
  const [recalcBaseId, setRecalcBaseId] = useState("");
  const [recalcComputedItems, setRecalcComputedItems] = useState<any[] | null>(null);
  const [recalcMissingItems, setRecalcMissingItems] = useState<any[] | null>(null);
  const [recalcMissingDrafts, setRecalcMissingDrafts] = useState<Record<string, string>>({});
  const [recalcSaving, setRecalcSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterKind, setFilterKind] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [productModal, setProductModal] = useState(false);
  const [warehouseModal, setWarehouseModal] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [reservationsFor, setReservationsFor] = useState<any | null>(null);
  const [reservations, setReservations] = useState<any[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(false);

  async function openReservations(b: any) {
    setReservationsFor(b);
    setReservations([]);
    setReservationsLoading(true);
    try {
      setReservations(await stockApi.openReservations(b.product_id));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReservationsLoading(false);
    }
  }

  const categoryOptions = flattenCats(categories);

  async function load() {
    try {
      const [p, c, w, b, u, a, h, mv, sup, spr] = await Promise.all([
        stockApi.products(),
        stockApi.categories(),
        stockApi.warehouses(),
        stockApi.balances(),
        configApi.units(),
        stockApi.assemblies(),
        stockApi.salePrices(),
        stockApi.movements(),
        configApi.suppliers(),
        biApi.supplierPrices(),
      ]);
      setProducts(p);
      setCategories(c);
      setWarehouses(w);
      setBalances(b);
      setUnits(u);
      setAssemblies(a);
      setSaleHistory(h);
      setMovements(mv);
      setSuppliers(sup);
      setSupplierPrices(spr);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setFormOpen(false);
    setListOpen(true);
    setError("");
  }, [page]);

  function startEditProduct(p: any) {
    setEditingProduct(p);
    setFormOpen(true);
  }

  async function removeProduct(id: string) {
    setError("");
    try {
      await stockApi.deleteProduct(id);
      if (editingProduct?.id === id) setEditingProduct(null);
      await load();
    } catch (err: any) {
      setError(err.message === "cannot delete: record is in use"
        ? "Produto em uso (saldo, movimento ou montagem)."
        : err.message);
    }
  }

  async function removeCategory(id: string) {
    setError("");
    try {
      await stockApi.deleteCategory(id);
      if (editingCategory?.id === id) setEditingCategory(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function startEditAssembly(a: any) {
    setEditingAssembly(a);
    setFormOpen(true);
    const margin = a.margin_percent != null ? Number(a.margin_percent) : 30;
    setSeedMarginPercent(margin);
    setItems((a.items || []).map((it: any) => {
      const base = { product_id: it.product_id, quantity: it.quantity, role: it.role };
      // Items priced under the old shared-margin model never got their own price persisted
      // (unit_price came back 0) — seed those from the assembly's margin, same as a legacy
      // "Sugerido" would've shown. Anything actually priced per-item round-trips as-is.
      if (it.unit_price > 0) return { ...base, unitPrice: it.unit_price };
      const lineCost = computeItemLineCost(base);
      return { ...base, unitPrice: lineCost != null ? Number((lineCost * (1 + margin / 100)).toFixed(4)) : undefined };
    }));
    setAssemblyProductId(a.product_id || "");
  }

  async function copyAssembly(a: any) {
    setError("");
    try {
      await stockApi.createAssembly({
        code: "",
        name: `${a.name} COPY`,
        product_id: a.product_id || "",
        margin_percent: a.margin_percent,
        items: (a.items || []).map((it: any) => ({
          product_id: it.product_id, quantity: it.quantity, role: it.role, unit_price: it.unit_price ?? 0,
        })),
      });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function toggleAssemblyActive(a: any) {
    setError("");
    try {
      await stockApi.updateAssembly(a.id, {
        code: a.code,
        name: a.name,
        product_id: a.product_id || "",
        margin_percent: a.margin_percent,
        active: !a.active,
        items: (a.items || []).map((it: any) => ({
          product_id: it.product_id, quantity: it.quantity, role: it.role, unit_price: it.unit_price ?? 0,
        })),
      });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function openRecalc(a: any) {
    setError("");
    setRecalcAssembly(a);
    setRecalcBaseId("");
    setRecalcComputedItems(null);
    setRecalcMissingItems(null);
    setRecalcMissingDrafts({});
  }

  function closeRecalc() {
    setRecalcAssembly(null);
    setRecalcBaseId("");
    setRecalcComputedItems(null);
    setRecalcMissingItems(null);
    setRecalcMissingDrafts({});
  }

  // Rule of three off the base kit's own per-unit price (its item's price ÷ its own quantity),
  // applied to this kit's quantity of the same product — e.g. base has Batata × 1.5 KG at
  // R$18 (R$12/KG), so a target with Batata × 1 KG gets R$12. Items with no match in the base
  // kit are left as-is here and collected for the user to price by hand.
  function runRecalc() {
    const base = assemblies.find((x) => x.id === recalcBaseId);
    if (!base || !recalcAssembly) return;
    const missing: any[] = [];
    const priced = (recalcAssembly.items || []).map((it: any) => {
      const baseItem = (base.items || []).find((b: any) => b.product_id === it.product_id);
      if (!baseItem || !Number(baseItem.quantity)) {
        missing.push(it);
        return it;
      }
      const perUnit = Number(baseItem.unit_price || 0) / Number(baseItem.quantity);
      return { ...it, unit_price: Number((perUnit * Number(it.quantity)).toFixed(4)) };
    });
    setRecalcComputedItems(priced);
    if (missing.length > 0) {
      setRecalcMissingItems(missing);
      setRecalcMissingDrafts(Object.fromEntries(missing.map((it) => [it.product_id, String(it.unit_price ?? "0")])));
    } else {
      applyRecalc(priced);
    }
  }

  async function applyRecalc(computedItems: any[]) {
    if (!recalcAssembly) return;
    setRecalcSaving(true);
    setError("");
    try {
      const finalItems = computedItems.map((it) =>
        recalcMissingDrafts[it.product_id] != null
          ? { ...it, unit_price: Number(recalcMissingDrafts[it.product_id]) || 0 }
          : it
      );
      const priceTotal = finalItems.reduce((sum, it) => sum + Number(it.unit_price || 0), 0);
      await stockApi.updateAssembly(recalcAssembly.id, {
        code: recalcAssembly.code,
        name: recalcAssembly.name,
        product_id: recalcAssembly.product_id || "",
        margin_percent: recalcAssembly.margin_percent,
        items: finalItems.map((it: any) => ({
          product_id: it.product_id, quantity: it.quantity, role: it.role, unit_price: it.unit_price ?? 0,
        })),
      });
      const productId = String(recalcAssembly.product_id || "");
      const currentSalePrice = products.find((p) => p.id === productId)?.sale_price;
      if (productId && priceTotal !== Number(currentSalePrice || 0)) {
        await stockApi.createSalePrice({ product_id: productId, new_price: priceTotal });
      }
      closeRecalc();
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRecalcSaving(false);
    }
  }

  async function saveAssembly(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError("");
    const f = new FormData(form);
    const body = {
      code: f.get("code"),
      name: f.get("name"),
      product_id: f.get("product_id") || "",
      margin_percent: Number(kitMarginPercent.toFixed(2)),
      active: f.get("active") === "on",
      items: items.filter((i) => i.product_id && i.quantity > 0).map((i) => ({
        product_id: i.product_id, quantity: i.quantity, role: i.role, unit_price: i.unitPrice ?? 0,
      })),
    };
    try {
      if (editingAssembly) await stockApi.updateAssembly(editingAssembly.id, body);
      else await stockApi.createAssembly(body);
      const productId = String(body.product_id || "");
      const currentSalePrice = products.find((p) => p.id === productId)?.sale_price;
      if (productId && kitPriceTotal !== Number(currentSalePrice || 0)) {
        await stockApi.createSalePrice({ product_id: productId, new_price: kitPriceTotal });
      }
      form.reset();
      setEditingAssembly(null);
      setItems([emptyItem()]);
      setSeedMarginPercent(30);
      setAssemblyProductId("");
      setFormOpen(false);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function addSalePrice(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError("");
    const f = new FormData(form);
    try {
      await stockApi.createSalePrice({
        product_id: f.get("product_id"),
        new_price: Number(f.get("new_price")),
      });
      form.reset();
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function supplierPriceUnitCost(sp: any) {
    const p = products.find((x) => x.id === sp.product_id);
    if (!p || !sp.min_qty) return null;
    const perPurchaseUnit = sp.price / sp.min_qty;
    const stockPerPurchase = convertQty(1, p.purchase_uom, stockUom(p), p.uom_conversions);
    if (stockPerPurchase == null || stockPerPurchase <= 0) return null;
    return perPurchaseUnit / stockPerPurchase;
  }

  async function openPricing(p: any) {
    setError("");
    setPricingProduct(p);
    setPricingTab("set");
    setPricingLoading(true);
    try {
      const [sh, ph] = await Promise.all([
        stockApi.salePrices(p.id),
        stockApi.purchasePrices(p.id),
      ]);
      setPricingSaleHistory(sh);
      setPricingPurchaseHistory(ph);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPricingLoading(false);
    }
  }

  function closePricing() {
    setPricingProduct(null);
    setPricingSaleHistory([]);
    setPricingPurchaseHistory([]);
  }

  async function savePricing(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pricingProduct) return;
    const f = new FormData(e.currentTarget);
    const saleStr = String(f.get("sale_price") ?? "");
    const purchaseStr = String(f.get("purchase_price") ?? "");
    setError("");
    setSavingPricing(true);
    try {
      if (saleStr !== "" && Number(saleStr) !== Number(pricingProduct.sale_price || 0)) {
        await stockApi.createSalePrice({ product_id: pricingProduct.id, new_price: Number(saleStr) });
      }
      if (purchaseStr !== "" && Number(purchaseStr) !== Number(pricingProduct.purchase_price || 0)) {
        await stockApi.createPurchasePrice({ product_id: pricingProduct.id, new_price: Number(purchaseStr) });
      }
      const [sh, ph, freshProducts] = await Promise.all([
        stockApi.salePrices(pricingProduct.id),
        stockApi.purchasePrices(pricingProduct.id),
        stockApi.products(),
      ]);
      setPricingSaleHistory(sh);
      setPricingPurchaseHistory(ph);
      setProducts(freshProducts);
      setPricingProduct(freshProducts.find((x: any) => x.id === pricingProduct.id) || pricingProduct);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingPricing(false);
    }
  }

  async function saveWarehouse(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError("");
    const f = new FormData(form);
    const body = { code: f.get("code"), name: f.get("name") };
    try {
      if (editingWarehouse) await stockApi.updateWarehouse(editingWarehouse.id, body);
      else await stockApi.createWarehouse(body);
      form.reset();
      setEditingWarehouse(null);
      setFormOpen(false);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function addBalance(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError("");
    const f = new FormData(form);
    try {
      await stockApi.setBalance({
        product_id: f.get("product_id"),
        warehouse_id: f.get("warehouse_id"),
        quantity: Number(f.get("quantity")),
      });
      form.reset();
      setEditingBalance(null);
      setWarehouseId("");
      setFormOpen(false);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function addMovement(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError("");
    const f = new FormData(form);
    try {
      if (moveDir === "TRANSFER") {
        await stockApi.transferStock({
          product_id: f.get("product_id"),
          from_warehouse_id: moveFrom,
          to_warehouse_id: moveTo,
          quantity: Number(f.get("quantity")),
        });
      } else {
        await stockApi.createMovement({
          product_id: f.get("product_id"),
          warehouse_id: moveFrom,
          direction: moveDir,
          subtype: moveSub,
          quantity: Number(f.get("quantity")),
        });
      }
      form.reset();
      setMoveDir("");
      setMoveSub("");
      setMoveFrom("");
      setMoveTo("");
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function productName(id: string) {
    return products.find((p) => p.id === id)?.name || id;
  }

  function itemUom(id: string) {
    return stockUom(products.find((p) => p.id === id));
  }

  // Mirrors stock-service's RecalculateAssembly cost formula: each item's quantity converted
  // into its product's purchase UoM (packaging/support items included), × that product's
  // purchase price. Computed live from the in-progress items draft so "Custo" and the
  // margin/price fields update as you edit the kit, without waiting for a save + Recalcular.
  function computeAssemblyCost(list: Item[]) {
    let cost = 0;
    for (const it of list) {
      if (!it.product_id || !it.quantity) continue;
      const p = products.find((x) => x.id === it.product_id);
      if (!p) continue;
      let qty = it.quantity;
      const from = stockUom(p);
      if (from && p.purchase_uom && from !== p.purchase_uom) {
        const converted = convertQty(qty, from, p.purchase_uom, p.uom_conversions);
        if (converted != null) qty = converted;
      }
      cost += qty * Number(p.purchase_price || 0);
    }
    return cost;
  }

  const liveAssemblyCost = useMemo(() => computeAssemblyCost(items), [items, products]);

  // Cost per unit of the item's own sale/stock UoM (not its purchase UoM) — e.g. purchase
  // price is $110/CX, 1 CX = 20 KG, so this returns $5.50/KG. Lets each item row show cost
  // and proportional sale price in the same unit as its "Qtd" column.
  function itemCostPerSaleUnit(productId: string) {
    const p = products.find((x) => x.id === productId);
    if (!p) return null;
    const from = stockUom(p);
    if (!p.purchase_uom || !from || from === p.purchase_uom) return Number(p.purchase_price || 0);
    const stockPerPurchaseUnit = convertQty(1, p.purchase_uom, from, p.uom_conversions);
    if (stockPerPurchaseUnit == null || stockPerPurchaseUnit <= 0) return null;
    return Number(p.purchase_price || 0) / stockPerPurchaseUnit;
  }

  function computeItemLineCost(it: Item) {
    if (!it.product_id || !it.quantity) return null;
    const costPerUnit = itemCostPerSaleUnit(it.product_id);
    return costPerUnit != null ? costPerUnit * Number(it.quantity) : null;
  }

  function itemMarginPercent(it: Item) {
    const lineCost = computeItemLineCost(it);
    if (lineCost == null || lineCost <= 0 || it.unitPrice == null) return null;
    return (it.unitPrice / lineCost - 1) * 100;
  }

  // Quantity/product changes shift an item's cost, so its price is rescaled to keep that
  // item's OWN margin constant (falling back to the seed margin if it had no price yet) —
  // never touching any other item's price.
  function rescaleItemForNewCost(prevItem: Item, nextItem: Item): Item {
    const prevCost = computeItemLineCost(prevItem);
    const impliedMargin = prevCost != null && prevCost > 0 && prevItem.unitPrice != null
      ? prevItem.unitPrice / prevCost - 1
      : seedMarginPercent / 100;
    const nextCost = computeItemLineCost(nextItem);
    if (nextCost == null) return { ...nextItem, unitPrice: undefined };
    return { ...nextItem, unitPrice: Number((nextCost * (1 + impliedMargin)).toFixed(4)) };
  }

  const kitPriceTotal = items.reduce((sum, it) => sum + Number(it.unitPrice ?? 0), 0);
  const kitMarginPercent = liveAssemblyCost > 0 ? (kitPriceTotal / liveAssemblyCost - 1) * 100 : 0;

  const productOptions = products.map((p) => ({ value: p.id, code: p.sku, description: p.name }));
  const warehouseOptions = warehouses.map((w) => ({ value: w.id, code: w.code, description: w.name }));
  const listed = useMemo(() => {
    const ids = filterCategory ? categoryWithDescendants(categories, filterCategory) : null;
    return products.filter((p) => {
      if (filterKind && p.kind !== filterKind) return false;
      if (ids && !ids.has(p.category_id || "")) return false;
      return matchesQuery(p, query, categoryPath(p.category_id, categories));
    });
  }, [products, categories, query, filterKind, filterCategory]);

  const productColumns: DataTableColumn<any>[] = [
    { key: "sku", label: "SKU" },
    { key: "name", label: "Nome" },
    { key: "category", label: "Categoria", value: (p) => categoryPath(p.category_id, categories) || "—" },
    { key: "kind", label: "Tipo", value: (p) => kindLabel(p.kind) },
    { key: "purchase_uom", label: "Compra" },
    { key: "sale_uom", label: "Venda" },
    { key: "conversion", label: "Equivalência", value: (p) => conversionLabel(p) },
    { key: "purchase_price", label: "Preço compra", render: (p) => brl(p.purchase_price) },
    { key: "sale_price", label: "Preço venda", render: (p) => brl(p.sale_price) },
    {
      key: "actions",
      label: "",
      sortable: false,
      filterable: false,
      render: (p) => (
        <div className="row">
          <button type="button" className="secondary" onClick={() => startEditProduct(p)}>Editar</button>
          <button type="button" className="secondary" onClick={() => openPricing(p)}>Preços</button>
          <button type="button" className="secondary" onClick={() => removeProduct(p.id)}>Excluir</button>
        </div>
      ),
    },
  ];

  const pricingHistoryColumns: DataTableColumn<any>[] = [
    { key: "created_at", label: "Data", value: (h) => new Date(h.created_at), render: (h) => new Date(h.created_at).toLocaleString("pt-BR") },
    { key: "previous_price", label: "Preço anterior", render: (h) => brl(h.previous_price) },
    { key: "new_price", label: "Novo preço", render: (h) => brl(h.new_price) },
  ];

  const pricingPurchaseHistoryColumns: DataTableColumn<any>[] = [
    ...pricingHistoryColumns,
    { key: "reference_doc_id", label: "Documento", value: (h) => h.reference_doc_id || "—" },
  ];

  const supplierPriceColumns: DataTableColumn<any>[] = [
    { key: "supplier", label: "Fornecedor", value: (sp) => personName(suppliers, sp.supplier_id) },
    { key: "price", label: "Preço", render: (sp) => brl(sp.price) },
    { key: "min_qty", label: "Qtd mínima", render: (sp) => sp.min_qty },
    { key: "unit_cost", label: "Custo unitário", render: (sp) => { const c = supplierPriceUnitCost(sp); return c != null ? brl(c) : "—"; } },
    { key: "updated_at", label: "Atualizado em", value: (sp) => new Date(sp.updated_at), render: (sp) => new Date(sp.updated_at).toLocaleString("pt-BR") },
  ];

  const visibleAssemblies = useMemo(
    () => (showOnlyActiveAssemblies ? assemblies.filter((a) => a.active !== false) : assemblies),
    [assemblies, showOnlyActiveAssemblies]
  );

  const assemblyColumns: DataTableColumn<any>[] = [
    { key: "code", label: "Código" },
    { key: "name", label: "Nome" },
    {
      key: "items",
      label: "Itens",
      value: (a) =>
        (a.items || []).map((it: Item) => `${productName(it.product_id)} × ${it.quantity}${itemUom(it.product_id) ? ` ${itemUom(it.product_id)}` : ""}`).join(" · "),
    },
    { key: "cost", label: "Custo", render: (a) => brl(a.cost) },
    { key: "suggested_price", label: "Sugerido", render: (a) => brl(a.suggested_price) },
    {
      key: "sale_price",
      label: "Preço venda",
      value: (a) => Number(products.find((p) => p.id === a.product_id)?.sale_price || 0),
      render: (a) => brl(products.find((p) => p.id === a.product_id)?.sale_price || 0),
    },
    {
      key: "active",
      label: "Situação",
      value: (a) => (a.active ? "Ativo" : "Inativo"),
      render: (a) => <span className={`badge ${a.active ? "ok" : "warn"}`}>{a.active ? "Ativo" : "Inativo"}</span>,
    },
    {
      key: "actions",
      label: "",
      sortable: false,
      filterable: false,
      render: (a) => (
        <div className="row">
          <button className="secondary" onClick={() => startEditAssembly(a)}>Editar</button>
          <button className="secondary" onClick={() => copyAssembly(a)}>Copiar</button>
          <button className="secondary" onClick={() => stockApi.recalculateAssembly(a.id).then(load).catch((e) => setError(e.message))}>Recalcular</button>
          <button className="secondary" onClick={() => openRecalc(a)}>Usar kit base</button>
          {a.product_id && (
            <button className="secondary" onClick={() => stockApi.applyAssemblyPrice(a.id).then(load).catch((e) => setError(e.message))}>Aplicar preço</button>
          )}
          <button className="secondary" onClick={() => toggleAssemblyActive(a)}>{a.active ? "Desativar" : "Ativar"}</button>
        </div>
      ),
    },
  ];

  const salePriceColumns: DataTableColumn<any>[] = [
    { key: "sku", label: "Código" },
    { key: "created_at", label: "Data", value: (h) => new Date(h.created_at), render: (h) => new Date(h.created_at).toLocaleString("pt-BR") },
    { key: "previous_price", label: "Preço anterior", render: (h) => brl(h.previous_price) },
    { key: "new_price", label: "Novo preço", render: (h) => brl(h.new_price) },
  ];

  const warehouseColumns: DataTableColumn<any>[] = [
    { key: "code", label: "Código" },
    { key: "name", label: "Nome" },
    {
      key: "reserved",
      label: "Reservado",
      value: (w) => balances.filter((b) => b.warehouse_id === w.id).reduce((n, b) => n + Number(b.quantity_reserved || 0), 0),
    },
    {
      key: "actions",
      label: "",
      sortable: false,
      filterable: false,
      render: (w) => <button className="secondary" onClick={() => { setEditingWarehouse(w); setFormOpen(true); }}>Editar</button>,
    },
  ];

  const balanceColumns: DataTableColumn<any>[] = [
    { key: "product", label: "Produto", value: (b) => productName(b.product_id) },
    { key: "warehouse", label: "Almoxarifado", value: (b) => warehouses.find((w) => w.id === b.warehouse_id)?.name || b.warehouse_id },
    { key: "uom", label: "Unidade", value: (b) => stockUom(products.find((x) => x.id === b.product_id)) || "—" },
    {
      key: "uom2",
      label: "Unidade 2",
      render: (b) => {
        const p = products.find((x) => x.id === b.product_id);
        const um = stockUom(p);
        const um2 = p?.purchase_uom && p.purchase_uom !== um ? p.purchase_uom : "";
        if (!um2) return "—";
        const qty2 = convertQty(Number(b.quantity_available), um, um2, p?.uom_conversions);
        return `${qty2 == null ? "—" : brl(qty2)} ${um2}`;
      },
    },
    { key: "quantity_available", label: "Disponível" },
    {
      key: "quantity_reserved",
      label: "Reservado",
      value: (b) => Number(b.quantity_reserved || 0),
      render: (b) => (
        <span>
          {b.quantity_reserved}
          <button type="button" className="info-icon" style={{ cursor: "pointer", border: "none", padding: 0 }} onClick={() => openReservations(b)}>i</button>
        </span>
      ),
    },
    {
      key: "actions",
      label: "",
      sortable: false,
      filterable: false,
      render: (b) => (
        <button className="secondary" onClick={() => { setEditingBalance(b); setWarehouseId(b.warehouse_id); setFormOpen(true); }}>Editar</button>
      ),
    },
  ];

  const movementColumns: DataTableColumn<any>[] = [
    { key: "created_at", label: "Data", value: (m) => new Date(m.created_at), render: (m) => new Date(m.created_at).toLocaleString("pt-BR") },
    { key: "movement_type", label: "Tipo", value: (m) => moveTypeLabel(m.movement_type, m.subtype) },
    { key: "product", label: "Produto", value: (m) => productName(m.product_id) },
    { key: "warehouse", label: "Almoxarifado", value: (m) => warehouses.find((w) => w.id === m.warehouse_id)?.name || m.warehouse_id },
    { key: "quantity", label: "Qtd" },
    {
      key: "origin",
      label: "Origem",
      value: (m) => (m.reference_doc_type === "MANUAL" ? "Manual" : m.reference_doc_type === "TRANSFER" ? "Transferência" : m.reference_doc_type),
      render: (m) => <span className="muted">{m.reference_doc_type === "MANUAL" ? "Manual" : m.reference_doc_type === "TRANSFER" ? "Transferência" : m.reference_doc_type}</span>,
    },
  ];

  return (
    <div>
      <h1>{titles[page] || "Estoque"}</h1>
      {error && <p className="error">{error}</p>}
      {loading ? <Loading /> : (
        <>
      {page === "produtos" && (
        <CadastroLayout
          formOpen={formOpen}
          listOpen={listOpen}
          onFormOpen={setFormOpen}
          onListOpen={setListOpen}
          form={
            <ProductForm
              key={editingProduct?.id ?? "new"}
              units={units}
              categories={categories}
              editing={editingProduct}
              onCategoriesChange={setCategories}
              onCancel={editingProduct ? () => { setEditingProduct(null); setFormOpen(false); } : undefined}
              onSaved={() => { setEditingProduct(null); setFormOpen(false); load(); }}
            />
          }
          list={
            <>
              <div className="row">
                <div className="field">
                  <label>Pesquisa</label>
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="SKU, nome, barras, NCM" />
                </div>
                <div className="field">
                  <label>Tipo</label>
                  <Autocomplete
                    value={filterKind}
                    allowEmpty
                    emptyLabel="Todos"
                    options={[
                      { value: "FINAL", code: "FINAL", description: "Produto final" },
                      { value: "SUPPORT", code: "SUPPORT", description: "Produto de apoio" },
                      { value: "FIXED_ASSET", code: "FIXED_ASSET", description: "Ativo fixo" },
                    ]}
                    onChange={setFilterKind}
                  />
                </div>
                <div className="field">
                  <label>Categoria</label>
                  <Autocomplete
                    value={filterCategory}
                    allowEmpty
                    emptyLabel="Todas"
                    options={categoryOptions}
                    onChange={setFilterCategory}
                  />
                </div>
              </div>
              <DataTable columns={productColumns} rows={listed} rowKey={(p) => p.id} emptyMessage="Nenhum produto encontrado." />
            </>
          }
        />
      )}
      {page === "categorias" && (
        <CadastroLayout
          formOpen={formOpen}
          listOpen={listOpen}
          onFormOpen={setFormOpen}
          onListOpen={setListOpen}
          form={
            <>
              <p className="muted">Árvore de categorias, por exemplo Legumes → Folhas ou Frutas → Cítricas.</p>
              <CategoryForm
                categories={categories}
                editing={editingCategory}
                onCancel={() => { setEditingCategory(null); setFormOpen(false); }}
                onSaved={() => { setEditingCategory(null); setFormOpen(false); load(); }}
              />
            </>
          }
          list={categories.length > 0 ? (
            <div className="tree">
              <CategoryNodes
                nodes={categories}
                onEdit={(c) => { setEditingCategory(c); setFormOpen(true); }}
                onDelete={removeCategory}
              />
            </div>
          ) : <p className="muted">Nenhuma categoria.</p>}
        />
      )}
      {page === "montagem" && (
        <CadastroLayout
          formOpen={formOpen}
          listOpen={listOpen}
          onFormOpen={setFormOpen}
          onListOpen={setListOpen}
          form={
            <>
              <p className="muted">
                Monte o kit com produtos e itens de apoio. Cada item tem seu próprio preço de venda e sua própria
                margem — alterar o preço de um item nunca muda o preço dos outros, só o total e a margem do kit
                abaixo, que são somas/médias calculadas, não campos.
              </p>
              <form key={editingAssembly?.id ?? "new"} onSubmit={saveAssembly}>
                <div className="row">
                  <CodeInput defaultValue={editingAssembly?.code ?? ""} required={!!editingAssembly} />
                  <div className="field"><label>Nome</label><input name="name" required defaultValue={editingAssembly?.name ?? ""} /></div>
                  <div className="field">
                    <label>Produto final</label>
                    <Autocomplete
                      name="product_id"
                      allowEmpty
                      defaultValue={editingAssembly?.product_id ?? ""}
                      options={products.filter((p) => p.kind !== "SUPPORT" && p.kind !== "FIXED_ASSET").map((p) => ({
                        value: p.id, code: p.sku, description: p.name,
                      }))}
                      createLabel="Cadastrar produto"
                      onCreate={() => setProductModal(true)}
                      onChange={setAssemblyProductId}
                    />
                  </div>
                  <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <input name="active" type="checkbox" defaultChecked={editingAssembly?.active ?? true} /> Ativo
                  </label>
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <div className="field">
                    <label>Custo total</label>
                    <p style={{ margin: "8px 0" }}>{brl(liveAssemblyCost)}</p>
                  </div>
                  <div className="field">
                    <label>
                      Margem do kit
                      <InfoTooltip text="Média calculada a partir da margem de cada item (preço total ÷ custo total do kit) — não é um campo, é só um resumo." />
                    </label>
                    <p style={{ margin: "8px 0" }}>{liveAssemblyCost > 0 ? `${kitMarginPercent.toFixed(1)}%` : "—"}</p>
                  </div>
                  <div className="field">
                    <label>Preço de venda total</label>
                    <p style={{ margin: "8px 0" }}>{brl(kitPriceTotal)}</p>
                    {!assemblyProductId && (
                      <p className="error" style={{ margin: "4px 0 0" }}>
                        Sem Produto final selecionado, o preço de venda não tem onde ser salvo.
                      </p>
                    )}
                  </div>
                </div>
                <h2 style={{ marginTop: 16 }}>Itens</h2>
                {items.map((it, i) => {
                  const uom = itemUom(it.product_id);
                  const costPerUnit = it.product_id ? itemCostPerSaleUnit(it.product_id) : null;
                  const lineCost = costPerUnit != null ? costPerUnit * Number(it.quantity || 0) : null;
                  const margin = itemMarginPercent(it);
                  return (
                    <div className="row" key={i} style={{ marginTop: 8 }}>
                      <div className="field">
                        <label>Produto</label>
                        <Autocomplete
                          value={it.product_id}
                          required
                          options={products.filter((p) => p.kind !== "FIXED_ASSET").map((p) => ({
                            value: p.id, code: p.sku, description: `${p.name} (${kindLabel(p.kind)})`,
                          }))}
                          createLabel="Cadastrar produto"
                          onCreate={() => setProductModal(true)}
                          onChange={(product_id) => {
                            const next = [...items];
                            next[i] = rescaleItemForNewCost(it, { ...it, product_id });
                            setItems(next);
                          }}
                        />
                      </div>
                      <div className="field">
                        <label>Qtd{uom ? ` (${uom})` : ""}</label>
                        <input type="number" step="0.0001" value={it.quantity} onChange={(e) => {
                          const next = [...items];
                          next[i] = rescaleItemForNewCost(it, { ...it, quantity: Number(e.target.value) });
                          setItems(next);
                        }} required />
                      </div>
                      <div className="field">
                        <label>Papel</label>
                        <Autocomplete
                          value={it.role}
                          options={[
                            { value: "COMPONENT", code: "COMPONENT", description: "Componente" },
                            { value: "SUPPORT", code: "SUPPORT", description: "Apoio" },
                          ]}
                          onChange={(role) => {
                            const next = [...items];
                            next[i] = { ...it, role };
                            setItems(next);
                          }}
                        />
                      </div>
                      <div className="field">
                        <label>Custo</label>
                        <p style={{ margin: "8px 0" }}>
                          {lineCost != null ? brl(lineCost) : "—"}
                          {costPerUnit != null && uom && <span className="muted"> ({brl(costPerUnit)}/{uom})</span>}
                        </p>
                      </div>
                      <div className="field">
                        <label>Preço de venda</label>
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={it.unitPrice ?? ""}
                          disabled={!lineCost}
                          title={!lineCost ? "Selecione um produto com custo para poder definir o preço deste item" : undefined}
                          onChange={(e) => {
                            const next = [...items];
                            next[i] = { ...it, unitPrice: e.target.value === "" ? undefined : Number(e.target.value) };
                            setItems(next);
                          }}
                        />
                      </div>
                      <div className="field">
                        <label>Margem</label>
                        <p style={{ margin: "8px 0" }}>{margin != null ? `${margin.toFixed(1)}%` : "—"}</p>
                      </div>
                      <button type="button" className="secondary" onClick={() => setItems(items.filter((_, j) => j !== i))}>Remover</button>
                    </div>
                  );
                })}
                <div className="row" style={{ marginTop: 12 }}>
                  <button type="button" className="secondary" onClick={() => setItems([...items, emptyItem()])}>Adicionar item</button>
                  <button>{editingAssembly ? "Salvar montagem" : "Adicionar montagem"}</button>
                  {editingAssembly && (
                    <button type="button" className="secondary" onClick={() => { setEditingAssembly(null); setItems([emptyItem()]); setSeedMarginPercent(30); setAssemblyProductId(""); setFormOpen(false); }}>Cancelar</button>
                  )}
                </div>
              </form>
            </>
          }
          list={
            <>
              <label className="row" style={{ alignItems: "center", gap: 6, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={showOnlyActiveAssemblies}
                  onChange={(e) => setShowOnlyActiveAssemblies(e.target.checked)}
                />
                Mostrar somente ativos
              </label>
              <DataTable columns={assemblyColumns} rows={visibleAssemblies} rowKey={(a) => a.id} emptyMessage="Nenhuma montagem cadastrada." />
            </>
          }
        />
      )}
      {page === "precos" && (
        <CadastroLayout
          formOpen={formOpen}
          listOpen={listOpen}
          onFormOpen={setFormOpen}
          onListOpen={setListOpen}
          form={
            <form className="row" onSubmit={addSalePrice}>
              <div className="field">
                <label>Produto</label>
                <Autocomplete
                  name="product_id"
                  options={productOptions}
                  required
                  createLabel="Cadastrar produto"
                  onCreate={() => setProductModal(true)}
                />
              </div>
              <div className="field"><label>Novo preço</label><input name="new_price" type="number" step="0.01" required /></div>
              <button>Cadastrar preço</button>
            </form>
          }
          list={<DataTable columns={salePriceColumns} rows={saleHistory} rowKey={(h) => h.id} emptyMessage="Nenhum histórico de preço ainda." />}
        />
      )}
      {page === "almoxarifados" && (
        <CadastroLayout
          formOpen={formOpen}
          listOpen={listOpen}
          onFormOpen={setFormOpen}
          onListOpen={setListOpen}
          form={
            <form className="row" key={editingWarehouse?.id ?? "new"} onSubmit={saveWarehouse}>
              <CodeInput defaultValue={editingWarehouse?.code ?? ""} required={!!editingWarehouse} />
              <div className="field"><label>Nome</label><input name="name" required defaultValue={editingWarehouse?.name ?? ""} /></div>
              <button>{editingWarehouse ? "Salvar" : "Adicionar"}</button>
              {editingWarehouse && <button type="button" className="secondary" onClick={() => { setEditingWarehouse(null); setFormOpen(false); }}>Cancelar</button>}
            </form>
          }
          list={<DataTable columns={warehouseColumns} rows={warehouses} rowKey={(w) => w.id} emptyMessage="Nenhum almoxarifado cadastrado." />}
        />
      )}
      {page === "saldos" && (
        <CadastroLayout
          formOpen={formOpen}
          listOpen={listOpen}
          onFormOpen={setFormOpen}
          onListOpen={setListOpen}
          form={
            <form className="row" key={editingBalance?.id ?? "new"} onSubmit={addBalance}>
              <div className="field">
                <label>Produto</label>
                <Autocomplete
                  name="product_id"
                  options={products.filter((p) => p.kind !== "FIXED_ASSET").map((p) => ({ value: p.id, code: p.sku, description: p.name }))}
                  required
                  defaultValue={editingBalance?.product_id ?? ""}
                  createLabel="Cadastrar produto"
                  onCreate={() => setProductModal(true)}
                />
              </div>
              <div className="field">
                <label>Almoxarifado</label>
                <Autocomplete
                  name="warehouse_id"
                  value={warehouseId || editingBalance?.warehouse_id || ""}
                  options={warehouseOptions}
                  required
                  createLabel="Cadastrar almoxarifado"
                  onCreate={() => setWarehouseModal(true)}
                  onChange={setWarehouseId}
                />
              </div>
              <div className="field"><label>Qtd (un. venda)</label><input name="quantity" type="number" step="0.0001" required defaultValue={editingBalance?.quantity_available ?? ""} /></div>
              <button>{editingBalance ? "Salvar saldo" : "Definir saldo"}</button>
              {editingBalance && <button type="button" className="secondary" onClick={() => { setEditingBalance(null); setWarehouseId(""); setFormOpen(false); }}>Cancelar</button>}
            </form>
          }
          list={<DataTable columns={balanceColumns} rows={balances} rowKey={(b) => b.id} emptyMessage="Nenhum saldo cadastrado." />}
        />
      )}
      {reservationsFor && (
        <Modal title="Pedidos com reserva" onClose={() => setReservationsFor(null)}>
          <p className="muted">
            {productName(reservationsFor.product_id)} — {warehouses.find((w) => w.id === reservationsFor.warehouse_id)?.name || reservationsFor.warehouse_id}
          </p>
          {reservationsLoading ? (
            <Loading />
          ) : reservations.length === 0 ? (
            <p className="muted">Nenhum pedido com reserva aberta para este produto — o valor "Reservado" deve estar zerado; se não estiver, é um saldo desatualizado.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Almoxarifado</th>
                    <th>Qtd</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.map((r) => (
                    <tr key={r.id}>
                      <td>{(r.sales_order_id || "").slice(0, 8).toUpperCase()}</td>
                      <td>{warehouses.find((w) => w.id === r.warehouse_id)?.name || r.warehouse_id || "—"}</td>
                      <td>{r.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
      {page === "movimentos" && (
        <CadastroLayout
          formOpen={formOpen}
          listOpen={listOpen}
          onFormOpen={setFormOpen}
          onListOpen={setListOpen}
          form={
            <form className="row" onSubmit={addMovement}>
              <div className="field">
                <label>Produto</label>
                <Autocomplete
                  name="product_id"
                  options={products.filter((p) => p.kind !== "FIXED_ASSET").map((p) => ({ value: p.id, code: p.sku, description: p.name }))}
                  required
                  createLabel="Cadastrar produto"
                  onCreate={() => setProductModal(true)}
                />
              </div>
              <div className="field">
                <label>Tipo</label>
                <Autocomplete
                  required
                  value={moveDir}
                  options={[
                    { value: "IN", code: "IN", description: "Entrada" },
                    { value: "OUT", code: "OUT", description: "Saída" },
                    { value: "TRANSFER", code: "TRANSFER", description: "Transferência entre almoxarifados" },
                  ]}
                  onChange={(v) => {
                    setMoveDir(v);
                    setMoveSub("");
                    setMoveTo("");
                  }}
                />
              </div>
              {moveDir && moveDir !== "TRANSFER" && (
                <div className="field">
                  <label>Subtipo</label>
                  <Autocomplete
                    required
                    value={moveSub}
                    options={(MOVE_SUBTYPES[moveDir] || []).map((s) => ({ value: s.value, code: s.value, description: s.label }))}
                    onChange={setMoveSub}
                  />
                </div>
              )}
              <div className="field">
                <label>{moveDir === "TRANSFER" ? "Almoxarifado de origem" : "Almoxarifado"}</label>
                <Autocomplete
                  required
                  value={moveFrom}
                  options={warehouseOptions}
                  onChange={setMoveFrom}
                  createLabel="Cadastrar almoxarifado"
                  onCreate={() => setWarehouseModal(true)}
                />
              </div>
              {moveDir === "TRANSFER" && (
                <div className="field">
                  <label>Almoxarifado de destino</label>
                  <Autocomplete
                    required
                    value={moveTo}
                    options={warehouseOptions.filter((w) => w.value !== moveFrom)}
                    onChange={setMoveTo}
                  />
                </div>
              )}
              <div className="field"><label>Qtd (un. venda)</label><input name="quantity" type="number" step="0.0001" required /></div>
              <button>Lançar movimento</button>
            </form>
          }
          list={<DataTable columns={movementColumns} rows={movements} rowKey={(m) => m.id} emptyMessage="Nenhum movimento registrado." />}
        />
      )}
      {pricingProduct && (
        <Modal title={`Preços — ${pricingProduct.sku} ${pricingProduct.name}`} onClose={closePricing}>
          <div className="row" style={{ marginBottom: 12 }}>
            <button type="button" className={pricingTab === "set" ? "" : "secondary"} onClick={() => setPricingTab("set")}>Definir preços</button>
            <button type="button" className={pricingTab === "suppliers" ? "" : "secondary"} onClick={() => setPricingTab("suppliers")}>Fornecedores</button>
            <button type="button" className={pricingTab === "history" ? "" : "secondary"} onClick={() => setPricingTab("history")}>Histórico</button>
          </div>
          {pricingLoading ? <Loading /> : (
            <>
              {pricingTab === "set" && (
                <form onSubmit={savePricing}>
                  <div className="row">
                    <div className="field">
                      <label>Preço de venda</label>
                      <input name="sale_price" type="number" step="0.01" defaultValue={pricingProduct.sale_price ?? ""} />
                    </div>
                    <div className="field">
                      <label>Preço de compra</label>
                      <input name="purchase_price" type="number" step="0.01" defaultValue={pricingProduct.purchase_price ?? ""} />
                    </div>
                  </div>
                  <div className="row" style={{ marginTop: 12 }}>
                    <button disabled={savingPricing}>{savingPricing ? "Salvando..." : "Salvar preços"}</button>
                  </div>
                </form>
              )}
              {pricingTab === "suppliers" && (
                <DataTable
                  columns={supplierPriceColumns}
                  rows={supplierPrices.filter((sp) => sp.product_id === pricingProduct.id)}
                  rowKey={(sp) => sp.id}
                  emptyMessage="Nenhum preço de fornecedor cadastrado para este produto."
                />
              )}
              {pricingTab === "history" && (
                <>
                  <h3>Venda</h3>
                  <DataTable columns={pricingHistoryColumns} rows={pricingSaleHistory} rowKey={(h) => h.id} emptyMessage="Nenhum histórico de venda." />
                  <h3 style={{ marginTop: 16 }}>Compra</h3>
                  <DataTable columns={pricingPurchaseHistoryColumns} rows={pricingPurchaseHistory} rowKey={(h) => h.id} emptyMessage="Nenhum histórico de compra." />
                </>
              )}
            </>
          )}
        </Modal>
      )}
      {recalcAssembly && (
        <Modal title={`Recalcular preços — ${recalcAssembly.code} ${recalcAssembly.name}`} onClose={closeRecalc}>
          <p className="muted">
            Escolha um kit base já precificado. Para cada item deste kit, o preço é recalculado por regra de
            três a partir do preço por unidade do mesmo produto no kit base (preço do item no kit base ÷ sua
            quantidade lá, × a quantidade deste kit).
          </p>
          <div className="field">
            <label>Kit base</label>
            <Autocomplete
              value={recalcBaseId}
              allowEmpty
              emptyLabel="Selecione"
              options={assemblies.filter((a) => a.id !== recalcAssembly.id).map((a) => ({ value: a.id, code: a.code, description: a.name }))}
              onChange={setRecalcBaseId}
            />
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" disabled={!recalcBaseId || recalcSaving} onClick={runRecalc}>
              {recalcSaving ? "Aplicando..." : "Calcular e aplicar"}
            </button>
          </div>
        </Modal>
      )}
      {recalcMissingItems && (
        <Modal depth={1} title="Itens sem correspondência no kit base" onClose={() => setRecalcMissingItems(null)}>
          <p className="muted">
            Esses itens não existem no kit base escolhido, então não há preço de referência para calcular por
            regra de três — informe o preço de cada um manualmente.
          </p>
          {recalcMissingItems.map((it) => (
            <div className="field" key={it.product_id}>
              <label>{productName(it.product_id)} × {it.quantity}{itemUom(it.product_id) ? ` ${itemUom(it.product_id)}` : ""}</label>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={recalcMissingDrafts[it.product_id] ?? ""}
                onChange={(e) => setRecalcMissingDrafts((d) => ({ ...d, [it.product_id]: e.target.value }))}
              />
            </div>
          ))}
          <div className="row" style={{ marginTop: 12 }}>
            <button
              type="button"
              disabled={recalcSaving}
              onClick={() => recalcComputedItems && applyRecalc(recalcComputedItems)}
            >
              {recalcSaving ? "Aplicando..." : "Aplicar"}
            </button>
          </div>
        </Modal>
      )}
      {productModal && <ProductCreateModal onClose={() => setProductModal(false)} onCreated={() => load()} />}
      {warehouseModal && (
        <WarehouseCreateModal
          onClose={() => setWarehouseModal(false)}
          onCreated={(w) => { setWarehouseId(w.id); load(); }}
        />
      )}
        </>
      )}
    </div>
  );
}
