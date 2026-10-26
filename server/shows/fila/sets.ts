// Serie di Fila Indiana. `items` è GIÀ nell'ordine giusto; il gioco ne pesca FILA.ITEMS mantenendo l'ordine.
// Solo dati stabili: niente valori che cambiano con le misurazioni (es. l'altezza dell'Etna).

export interface FilaSet {
  title: string;
  from: string;
  to: string;
  items: { label: string; value: string }[];
}

export const FILA_SETS: readonly FilaSet[] = [
  {
    title: 'Dal più vicino al più lontano dal Sole',
    from: 'Più vicino',
    to: 'Più lontano',
    items: ['Mercurio', 'Venere', 'Terra', 'Marte', 'Giove', 'Saturno', 'Urano', 'Nettuno'].map((label, i) => ({ label, value: `${i + 1}° pianeta` }))
  },
  {
    title: 'Dalla montagna più alta alla più bassa',
    from: 'Più alta',
    to: 'Più bassa',
    items: [
      { label: 'Everest', value: '8.849 m' },
      { label: 'K2', value: '8.611 m' },
      { label: 'Monte Bianco', value: 'circa 4.806 m' },
      { label: 'Cervino', value: '4.478 m' },
      { label: 'Gran Sasso', value: '2.912 m' },
      { label: 'Vesuvio', value: '1.281 m' }
    ]
  },
  {
    title: 'Da nord a sud',
    from: 'Più a nord',
    to: 'Più a sud',
    items: [
      { label: 'Bolzano', value: '46,5° N' },
      { label: 'Milano', value: '45,5° N' },
      { label: 'Bologna', value: '44,5° N' },
      { label: 'Firenze', value: '43,8° N' },
      { label: 'Roma', value: '41,9° N' },
      { label: 'Napoli', value: '40,9° N' },
      { label: 'Palermo', value: '38,1° N' }
    ]
  },
  {
    title: 'Dall’animale più leggero al più pesante',
    from: 'Più leggero',
    to: 'Più pesante',
    items: [
      { label: 'Formica', value: 'pochi milligrammi' },
      { label: 'Passero', value: '≈ 30 g' },
      { label: 'Gatto', value: '≈ 4 kg' },
      { label: 'Pecora', value: '≈ 70 kg' },
      { label: 'Cavallo', value: '≈ 500 kg' },
      { label: 'Elefante', value: '≈ 5 tonnellate' },
      { label: 'Balenottera azzurra', value: '≈ 150 tonnellate' }
    ]
  },
  {
    title: 'Da chi ha meno zampe a chi ne ha di più',
    from: 'Meno zampe',
    to: 'Più zampe',
    items: [
      { label: 'Serpente', value: '0' },
      { label: 'Gallina', value: '2' },
      { label: 'Cane', value: '4' },
      { label: 'Formica', value: '6' },
      { label: 'Ragno', value: '8' }
    ]
  },
  {
    title: 'Numeri romani: dal più piccolo al più grande',
    from: 'Più piccolo',
    to: 'Più grande',
    items: [
      { label: 'IV', value: '4' },
      { label: 'IX', value: '9' },
      { label: 'XL', value: '40' },
      { label: 'XC', value: '90' },
      { label: 'CD', value: '400' },
      { label: 'CM', value: '900' },
      { label: 'MM', value: '2000' }
    ]
  },
  {
    title: 'Fiumi italiani: dal più lungo al più corto',
    from: 'Più lungo',
    to: 'Più corto',
    items: [
      { label: 'Po', value: '652 km' },
      { label: 'Adige', value: '410 km' },
      { label: 'Tevere', value: '405 km' },
      { label: 'Adda', value: '313 km' },
      { label: 'Arno', value: '241 km' }
    ]
  },
  {
    title: 'Dalla misura più piccola alla più grande',
    from: 'Più piccola',
    to: 'Più grande',
    items: ['Millimetro', 'Centimetro', 'Decimetro', 'Metro', 'Decametro', 'Ettometro', 'Chilometro'].map((label, i) => ({ label, value: `10^${i - 3} m` }))
  }
];
