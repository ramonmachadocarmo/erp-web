type Props = {
  text: string;
};

/** Small "i" icon that shows a definition/explanation on hover — for field labels
 * that need a one-line concept explained (e.g. "margin" being ambiguous between
 * markup-on-cost and gross-margin-on-price). */
export function InfoTooltip({ text }: Props) {
  return (
    <span className="info-icon" data-tip={text} tabIndex={0}>
      i
    </span>
  );
}
