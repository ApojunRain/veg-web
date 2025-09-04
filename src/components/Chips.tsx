// src/components/Chips.tsx

type Props<T extends string | number> = {
  value: T;
  options: { label: string; value: T }[];
  onChange: (v: T) => void;
};

export default function Chips<T extends string | number>({
  value,
  options,
  onChange,
}: Props<T>) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={`${o.value}`}
            onClick={() => onChange(o.value)}
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              border: `1px solid ${active ? '#0ea5e9' : '#ddd'}`,
              background: active ? '#e0f2fe' : 'white',
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
