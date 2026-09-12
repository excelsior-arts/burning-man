/** A range for continuous adjustment paired with an exact numeric entry. */
export function numberSlider(
  label: string,
  min: number,
  max: number,
  step: number,
  change: (value: number) => void,
) {
  const element = document.createElement('div');
  element.className = 'numeric-control';
  const row = document.createElement('div');
  row.className = 'number-row';
  const number = document.createElement('input');
  number.type = 'number';
  number.setAttribute('aria-label', label);
  const text = document.createElement('span');
  text.textContent = label;
  row.append(text, number);
  const range = document.createElement('input');
  range.type = 'range';
  range.setAttribute('aria-label', `${label} slider`);
  for (const input of [number, range]) {
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
  }
  let current = min;
  const commit = (input: HTMLInputElement) => {
    const value = Number(input.value);
    if (input.value === '' || !Number.isFinite(value)) {
      input.value = String(current);
      return;
    }
    change(Math.max(Number(input.min), Math.min(Number(input.max), value)));
  };
  range.oninput = () => {
    number.value = range.value;
    commit(range);
  };
  number.onchange = () => commit(number);
  element.append(row, range);
  return {
    element,
    number,
    range,
    set(value: number, lo = min, hi = max) {
      current = value;
      const low = Math.ceil((lo - 1e-7) / step) * step,
        high = Math.floor((hi + 1e-7) / step) * step;
      for (const input of [number, range]) {
        input.min = String(low);
        input.max = String(Math.max(low, high));
        input.value = String(value);
      }
    },
  };
}
