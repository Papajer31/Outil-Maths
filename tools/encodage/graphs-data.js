export const LEVELS = [
  {
    "level": 1,
    "graphs": [
      "a",
      "i",
      "r",
      "l",
      "o",
      "s1",
      "é",
      "u",
      "f",
      "e",
      "ch",
      "m"
    ]
  },
  {
    "level": 2,
    "graphs": [
      "ou",
      "v",
      "è",
      "ê",
      "n",
      "an",
      "t"
    ]
  },
  {
    "level": 3,
    "graphs": [
      "oi",
      "c1",
      "en",
      "p",
      "d"
    ]
  },
  {
    "level": 4,
    "graphs": [
      "on",
      "z",
      "ai",
      "b",
      "y",
      "au",
      "eau"
    ]
  },
  {
    "level": 5,
    "graphs": [
      "j",
      "in",
      "ss",
      "s2"
    ]
  },
  {
    "level": 6,
    "graphs": [
      "g1",
      "gu",
      "c2",
      "ç",
      "ei",
      "et",
      "qu",
      "k"
    ]
  },
  {
    "level": 7,
    "graphs": [
      "eu",
      "g2",
      "ge",
      "ph",
      "gn"
    ]
  }
];

export const GRAPH_ORDER = [
  "a",
  "i",
  "r",
  "l",
  "o",
  "s1",
  "é",
  "u",
  "f",
  "e",
  "ch",
  "m",
  "ou",
  "v",
  "è",
  "ê",
  "n",
  "an",
  "t",
  "oi",
  "c1",
  "en",
  "p",
  "d",
  "on",
  "z",
  "ai",
  "b",
  "y",
  "au",
  "eau",
  "j",
  "in",
  "ss",
  "s2",
  "g1",
  "gu",
  "c2",
  "ç",
  "ei",
  "et",
  "qu",
  "k",
  "eu",
  "g2",
  "ge",
  "ph",
  "gn"
];

export const PLAUSIBLE_GROUPS = [
  [
    "i",
    "y"
  ],
  [
    "o",
    "au",
    "eau"
  ],
  [
    "s1",
    "ss",
    "c2",
    "ç"
  ],
  [
    "f",
    "ph"
  ],
  [
    "e",
    "eu"
  ],
  [
    "è",
    "ê",
    "ai",
    "ei",
    "et"
  ],
  [
    "an",
    "en"
  ],
  [
    "c1",
    "k",
    "qu"
  ],
  [
    "z",
    "s2"
  ],
  [
    "j",
    "g2",
    "ge"
  ],
  [
    "g1",
    "gu"
  ]
];

export const VARIANT_HINTS = {
  "s1": "salade",
  "s2": "framboise",
  "c1": "carte",
  "c2": "cerise",
  "g1": "gâteau",
  "g2": "girafe"
};

export const FALLBACKS = {
  "â": "a",
  "ô": "o"
};
