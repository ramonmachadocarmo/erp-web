// Single source of truth for the shell's nav tree and the Perfis screen's
// permission-matrix editor. Keep this in sync with apps/web/shell/src/App.tsx's
// <Routes> list (every `to` here must have a matching <Route>).

export type MenuLeaf = { to: string; label: string };
export type MenuGroup = { title: string; items?: MenuLeaf[]; groups?: MenuGroup[] };

export const MENU: MenuGroup[] = [
  {
    title: "PDV",
    items: [
      { to: "/pdv/pesagem", label: "Pesagem" },
      { to: "/pdv/pedidos", label: "Pedidos" },
    ],
  },
  {
    title: "Gestão de produtos",
    items: [
      { to: "/producao/categorias", label: "Categorias" },
      { to: "/producao/produtos", label: "Produtos" },
      { to: "/producao/montagem", label: "Montagem" },
    ],
  },
  {
    title: "Estoque",
    items: [
      { to: "/estoque/almoxarifados", label: "Almoxarifados" },
      { to: "/estoque/saldos", label: "Saldos" },
      { to: "/estoque/movimentos", label: "Movimentos" },
    ],
  },
  {
    title: "Vendas",
    items: [
      { to: "/vendas/pedidos", label: "Pedidos" },
      { to: "/vendas/precos", label: "Preços de venda" },
    ],
  },
  {
    title: "Compras",
    items: [
      { to: "/compras/orcamentos", label: "Orçamentos" },
      { to: "/compras/pedidos", label: "Pedidos" },
      { to: "/compras/historico", label: "Histórico" },
    ],
  },
  {
    title: "Logística",
    groups: [
      {
        title: "Entrada",
        items: [
          { to: "/logistica/entrada", label: "Entrada" },
          { to: "/logistica/conferencia", label: "Conferência" },
        ],
      },
      {
        title: "Saída",
        items: [
          { to: "/logistica/separacao", label: "Separação" },
          { to: "/logistica/pesagem-pedidos", label: "Pesagem de pedidos" },
          { to: "/logistica/rotas", label: "Rotas" },
          { to: "/logistica/entrega", label: "Entrega" },
        ],
      },
    ],
  },
  {
    title: "Ativos",
    items: [
      { to: "/ativos/bens", label: "Cadastro" },
      { to: "/ativos/movimentos", label: "Movimentações" },
    ],
  },
  {
    title: "Fluxo de caixa",
    items: [
      { to: "/caixa/resumo", label: "Por dia" },
      { to: "/caixa/lancamentos", label: "Lançamentos" },
      { to: "/caixa/novo", label: "Novo lançamento" },
    ],
  },
  {
    title: "Fiscal",
    items: [
      { to: "/fiscal/saida", label: "Nota de saída" },
      { to: "/fiscal/entrada", label: "Nota de entrada" },
    ],
  },
  {
    title: "Inteligência de Negócio",
    items: [
      { to: "/bi/simulacao", label: "Simulação de cenários" },
      { to: "/bi/previsao", label: "Previsão de vendas" },
      { to: "/bi/estoque", label: "Plano de estoque" },
      { to: "/bi/orcamentos", label: "Orçamentos" },
      { to: "/bi/precos", label: "Preços de fornecedores" },
      { to: "/bi/financeiro", label: "Receita x Despesa" },
      { to: "/bi/agendamentos", label: "Agendamentos" },
    ],
  },
  {
    title: "Relatórios",
    items: [
      { to: "/relatorios/kits", label: "Kits" },
      { to: "/relatorios/estoque", label: "Estoque de produtos" },
      { to: "/relatorios/vendas", label: "Pedidos de venda" },
      { to: "/relatorios/clientes", label: "Ranking de clientes" },
      { to: "/relatorios/vendas-produto", label: "Vendas por produto" },
      { to: "/relatorios/compras", label: "Pedidos de compra" },
      { to: "/relatorios/previsao", label: "Previsão" },
      { to: "/relatorios/perdas", label: "Perdas" },
      { to: "/relatorios/financeiro", label: "Contas a pagar/receber" },
      { to: "/relatorios/fluxo", label: "Fluxo de caixa: realizado × projetado" },
    ],
  },
  {
    title: "Configurador",
    items: [
      { to: "/config/regras", label: "Regras" },
      { to: "/config/empresa", label: "Empresa" },
      { to: "/config/auditoria", label: "Auditoria" },
    ],
    groups: [
      {
        title: "Cadastros",
        items: [
          { to: "/config/cadastros/unidades", label: "Unidades" },
          { to: "/config/cadastros/clientes", label: "Clientes" },
          { to: "/config/cadastros/fornecedores", label: "Fornecedores" },
          { to: "/config/cadastros/centros", label: "Centros de distribuição" },
          { to: "/config/cadastros/veiculos", label: "Veículos" },
          { to: "/config/cadastros/pagamento", label: "Pagamento" },
          { to: "/config/cadastros/perfis", label: "Perfis" },
          { to: "/config/cadastros/usuarios", label: "Usuários" },
        ],
      },
    ],
  },
];

// The coarse, backend-enforced module list — same names services/gateway-service
// already routes by. Enforced at the gateway; drives the "Acesso por módulo" half
// of the Perfis screen.
export const MODULES = [
  "identity",
  "config",
  "stock",
  "sales",
  "purchasing",
  "assets",
  "cashflow",
  "invoicing",
  "bi",
  "reports",
  "audit",
] as const;

export const MODULE_LABELS: Record<string, string> = {
  identity: "Identidade e usuários",
  config: "Configurador",
  stock: "Estoque e produção",
  sales: "Vendas e logística",
  purchasing: "Compras",
  assets: "Ativos",
  cashflow: "Fluxo de caixa",
  invoicing: "Fiscal",
  bi: "Inteligência de Negócio",
  reports: "Relatórios",
  audit: "Auditoria",
};
