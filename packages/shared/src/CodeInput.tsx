type Props = {
  name?: string;
  label?: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
};

export function CodeInput({ name = "code", label = "Código", defaultValue = "", required, disabled }: Props) {
  return (
    <div className="field">
      <label>{label}</label>
      <input name={name} placeholder="Automático" defaultValue={defaultValue} required={required} disabled={disabled} />
    </div>
  );
}
