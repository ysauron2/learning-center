// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ChoiceOrNew, mergeOptions } from './ChoiceOrNew.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('mergeOptions', () => {
  it('junta listas sem repetir (ignora maiúsculas e espaços) e mantém a ordem', () => {
    expect(mergeOptions(['Redes', 'Linux'], ['linux ', 'Python', ''], [null, undefined, 'Redes'])).toEqual(['Redes', 'Linux', 'Python']);
    expect(mergeOptions()).toEqual([]);
  });
});

let container;
let latest;
function Harness({ initial = '', options = ['Udemy', 'Alura'] }) {
  const [v, setV] = useState(initial);
  latest = v;
  return <ChoiceOrNew id="x" label="Plataforma" value={v} options={options} onChange={setV} />;
}
async function mount(props) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<Harness {...props} />); });
}
const select = () => container.querySelector('select');
const choose = async (value) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select(), value);
    select().dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const type = async (text) => {
  const input = container.querySelector('input');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
beforeEach(() => { document.body.innerHTML = ''; });

describe('ChoiceOrNew', () => {
  it('lista as opções e a escolha "Outra…" (sem campo de texto de início)', async () => {
    await mount({ initial: 'Udemy' });
    expect([...select().options].map((o) => o.textContent)).toEqual(['Udemy', 'Alura', '➕ Outra…']);
    expect(select().value).toBe('Udemy');
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('label').textContent).toBe('Plataforma');
  });

  it('escolher uma opção existente atualiza o valor', async () => {
    await mount({ initial: 'Udemy' });
    await choose('Alura');
    expect(latest).toBe('Alura');
    expect(container.querySelector('input')).toBeNull();
  });

  it('"Outra…" mostra um campo, limpa o valor e o que se digita vira o valor', async () => {
    await mount({ initial: 'Udemy' });
    await choose('__new__');
    expect(container.querySelector('input')).not.toBeNull();
    expect(latest).toBe('');
    await type('Domestika');
    expect(latest).toBe('Domestika');
    expect(select().value).toBe('__new__'); // continua em "Outra…" enquanto digita
  });

  it('um valor personalizado já salvo (ao editar) aparece como opção e fica selecionado', async () => {
    await mount({ initial: 'Hotmart' });
    expect([...select().options].map((o) => o.textContent)).toEqual(['Udemy', 'Alura', 'Hotmart', '➕ Outra…']);
    expect(select().value).toBe('Hotmart');
  });

  it('voltar para uma opção da lista esconde o campo de texto', async () => {
    await mount({ initial: 'Udemy' });
    await choose('__new__');
    await choose('Alura');
    expect(container.querySelector('input')).toBeNull();
    expect(latest).toBe('Alura');
  });
});
