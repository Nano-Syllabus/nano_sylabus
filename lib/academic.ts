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

/** "3rd Semester" — the short form the Library and the Challenge Hub both show. */
export function academicNumberLabel(value: number, noun: string) {
  const mod100 = value % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? "th"
      : value % 10 === 1
        ? "st"
        : value % 10 === 2
          ? "nd"
          : value % 10 === 3
            ? "rd"
            : "th";
  return `${value}${suffix} ${noun}`;
}
