import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

export type AutocompleteOption = {
  value: string;
  code: string;
  description: string;
};

type Props = {
  name?: string;
  value?: string;
  defaultValue?: string;
  options: AutocompleteOption[];
  placeholder?: string;
  required?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  onChange?: (value: string) => void;
  onCreate?: () => void;
  createLabel?: string;
};

function normalize(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function matches(opt: AutocompleteOption, q: string) {
  if (!q) return true;
  const n = normalize(q);
  return normalize(opt.code).includes(n) || normalize(opt.description).includes(n);
}

function label(opt: AutocompleteOption) {
  return opt.code ? `${opt.code} — ${opt.description}` : opt.description;
}

export const Autocomplete = forwardRef<HTMLInputElement, Props>(function Autocomplete({
  name,
  value: controlled,
  defaultValue = "",
  options,
  placeholder = "Buscar código ou descrição",
  required,
  allowEmpty,
  emptyLabel = "Nenhum",
  onChange,
  onCreate,
  createLabel = "Cadastrar",
}: Props, forwardedRef) {
  const isControlled = controlled !== undefined;
  const [internal, setInternal] = useState(defaultValue);
  const selectedValue = isControlled ? controlled : internal;
  const all = useMemo(() => {
    if (!allowEmpty) return options;
    return [{ value: "", code: "", description: emptyLabel }, ...options];
  }, [allowEmpty, emptyLabel, options]);
  const selected = all.find((o) => o.value === selectedValue);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement);

  const filtered = useMemo(() => all.filter((o) => matches(o, query)), [all, query]);

  useEffect(() => {
    if (!selectedValue) setQuery("");
  }, [selectedValue]);

  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form) return;
    const onReset = () => {
      if (!isControlled) setInternal(defaultValue);
      setQuery("");
      setOpen(false);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [defaultValue, isControlled]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function commit(v: string) {
    if (!isControlled) setInternal(v);
    onChange?.(v);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="autocomplete" ref={rootRef}>
      {name && <input type="hidden" name={name} value={selectedValue} />}
      <input
        ref={inputRef}
        value={open ? query : selected ? label(selected) : ""}
        placeholder={placeholder}
        required={required && !selectedValue}
        autoComplete="off"
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setHighlight(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            if (open && filtered[highlight]) commit(filtered[highlight].value);
          } else if (e.key === "Tab") {
            if (open && query && filtered[highlight]) commit(filtered[highlight].value);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul className="autocomplete-list" role="listbox">
          {onCreate && (
            <li
              className="autocomplete-create"
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
                onCreate();
              }}
            >
              + {createLabel}
            </li>
          )}
          {filtered.length === 0 && <li className="autocomplete-empty">Nenhum resultado</li>}
          {filtered.map((o, i) => (
            <li
              key={`${o.value}-${i}`}
              role="option"
              className={i === highlight ? "active" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(o.value);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              {o.code ? <span className="code">{o.code}</span> : null}
              <span>{o.description}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
