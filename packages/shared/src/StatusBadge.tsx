const META: Record<string, { label: string; tone: string; hint: string }> = {
  PENDING_RESERVATION: { label: "Aguardando reserva", tone: "warn", hint: "Estoque ainda não foi reservado para este pedido." },
  PENDING: { label: "Pendente", tone: "warn", hint: "Pagamento ainda não recebido." },
  APPROVED: { label: "Aprovado", tone: "info", hint: "Pedido liberado, aguardando separação." },
  PICKING: { label: "Em separação", tone: "warn", hint: "Itens estão sendo separados no almoxarifado." },
  PICKED: { label: "Separado", tone: "info", hint: "Pronto para roteirizar e entregar." },
  DELIVERED: { label: "Entregue", tone: "ok", hint: "Entrega confirmada ao cliente." },
  UNDELIVERED: { label: "Não entregue", tone: "danger", hint: "Tentativa de entrega não realizada." },
  INVOICED: { label: "Faturado", tone: "ok", hint: "Nota fiscal emitida." },
  CANCELLED: { label: "Cancelado", tone: "danger", hint: "Pedido cancelado." },
  PLANNED: { label: "Planejada", tone: "", hint: "Rota montada, ainda não confirmada." },
  CONFIRMED: { label: "Confirmada", tone: "info", hint: "Rota confirmada para execução." },
  IN_PROGRESS: { label: "Em andamento", tone: "warn", hint: "Algumas paradas já foram entregues." },
  DONE: { label: "Concluída", tone: "ok", hint: "Todas as paradas da rota foram entregues." },
  PAID: { label: "Pago", tone: "ok", hint: "Pagamento recebido." },
};

export function statusMeta(status: string) {
  return META[status] || { label: status, tone: "", hint: status };
}

export function StatusBadge({ status, extra }: { status: string; extra?: string }) {
  const m = statusMeta(status);
  const hint = extra ? `${m.hint} Motivo: ${extra}` : m.hint;
  return (
    <span className={`badge ${m.tone}`.trim()} title={hint} data-tip={hint}>
      {m.label}
    </span>
  );
}
