const ORDINALS = [
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
  "Ninth",
  "Tenth",
];

export function academicOrdinalLabel(value: number, noun: string) {
  const word = ORDINALS[value - 1];
  return word ? `${word} ${noun}` : `${noun} ${value}`;
}
