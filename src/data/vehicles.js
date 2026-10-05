// U.S.-market vehicle catalog used by the guided selector and VIN decoder.
// Structure is unchanged from the original data file — only the data has grown.
// Each model lists the engines and trims offered and the year range.
//
// Covered through the 2026 model year. Historical year ranges start at 2015
// for established nameplates so existing customer/vehicle records continue to
// resolve. Where a model launched later, the range starts at its actual US
// debut year. Discontinued models keep their final-year ceiling.

const I3 = (l, hp, fuel = 'Gas') => ({ id: `${l}-i3-${hp}`, label: `${l}L 3-Cylinder`, detail: `${l}L I3 ${hp}hp ${fuel}`, cyl: 3 })
const I4 = (l, hp, fuel = 'Gas') => ({ id: `${l}-i4-${hp}`, label: `${l}L 4-Cylinder`, detail: `${l}L I4 ${hp}hp ${fuel}`, cyl: 4 })
const I5 = (l, hp, fuel = 'Gas') => ({ id: `${l}-i5-${hp}`, label: `${l}L 5-Cylinder`, detail: `${l}L I5 ${hp}hp ${fuel}`, cyl: 5 })
const I6 = (l, hp, fuel = 'Gas') => ({ id: `${l}-i6-${hp}`, label: `${l}L 6-Cylinder`, detail: `${l}L I6 ${hp}hp ${fuel}`, cyl: 6 })
const V6 = (l, hp, fuel = 'Gas') => ({ id: `${l}-v6-${hp}`, label: `${l}L V6`, detail: `${l}L V6 ${hp}hp ${fuel}`, cyl: 6 })
const V8 = (l, hp, fuel = 'Gas') => ({ id: `${l}-v8-${hp}`, label: `${l}L V8`, detail: `${l}L V8 ${hp}hp ${fuel}`, cyl: 8 })
const V10 = (l, hp, fuel = 'Gas') => ({ id: `${l}-v10-${hp}`, label: `${l}L V10`, detail: `${l}L V10 ${hp}hp ${fuel}`, cyl: 10 })
const V12 = (l, hp, fuel = 'Gas') => ({ id: `${l}-v12-${hp}`, label: `${l}L V12`, detail: `${l}L V12 ${hp}hp ${fuel}`, cyl: 12 })
const H4 = (l, hp, fuel = 'Gas') => ({ id: `${l}-h4-${hp}`, label: `${l}L Boxer 4`, detail: `${l}L H4 ${hp}hp ${fuel}`, cyl: 4 })
const H6 = (l, hp, fuel = 'Gas') => ({ id: `${l}-h6-${hp}`, label: `${l}L Boxer 6`, detail: `${l}L H6 ${hp}hp ${fuel}`, cyl: 6 })
const T3 = (l, hp) => ({ id: `${l}-i3t-${hp}`, label: `${l}L 3-Cyl Turbo`, detail: `${l}L I3 Turbo ${hp}hp Gas`, cyl: 3 })
const T4 = (l, hp) => ({ id: `${l}-i4t-${hp}`, label: `${l}L 4-Cyl Turbo`, detail: `${l}L I4 Turbo ${hp}hp Gas`, cyl: 4 })
const T6 = (l, hp) => ({ id: `${l}-v6t-${hp}`, label: `${l}L V6 Twin-Turbo`, detail: `${l}L V6 Twin-Turbo ${hp}hp Gas`, cyl: 6 })
const T8 = (l, hp) => ({ id: `${l}-v8t-${hp}`, label: `${l}L V8 Twin-Turbo`, detail: `${l}L V8 Twin-Turbo ${hp}hp Gas`, cyl: 8 })
const S6 = (l, hp) => ({ id: `${l}-i6t-${hp}`, label: `${l}L I6 Turbo`, detail: `${l}L I6 Turbo ${hp}hp Gas`, cyl: 6 })
const HY = (l, hp) => ({ id: `${l}-hyb-${hp}`, label: `${l}L 4-Cyl Hybrid`, detail: `${l}L I4 Hybrid ${hp}hp`, cyl: 4 })
const HY6 = (l, hp) => ({ id: `${l}-hyb6-${hp}`, label: `${l}L V6 Hybrid`, detail: `${l}L V6 Hybrid ${hp}hp`, cyl: 6 })
const PHEV = (l, hp) => ({ id: `${l}-phev-${hp}`, label: `${l}L Plug-in Hybrid`, detail: `${l}L I4 Plug-in Hybrid ${hp}hp`, cyl: 4 })
const D4 = (l, hp) => ({ id: `${l}-d4-${hp}`, label: `${l}L Diesel 4-Cyl`, detail: `${l}L I4 Diesel ${hp}hp`, cyl: 4 })
const D6 = (l, hp) => ({ id: `${l}-d6-${hp}`, label: `${l}L Diesel V6`, detail: `${l}L V6 Diesel ${hp}hp`, cyl: 6 })
const D8 = (l, hp) => ({ id: `${l}-d8-${hp}`, label: `${l}L Diesel V8`, detail: `${l}L V8 Diesel ${hp}hp`, cyl: 8 })
const EV = (kw, hp) => ({ id: `ev-${kw}-${hp}`, label: `${kw} kWh Electric`, detail: `${kw} kWh Battery Electric ${hp}hp`, cyl: 0 })

// Shortcuts for very common year ranges used across many models.
const Y = {
  Legacy: [2015, 2026],
  Mid2016: [2016, 2026], Mid2017: [2017, 2026], Mid2018: [2018, 2026], Mid2019: [2019, 2026],
  Mid2020: [2020, 2026], Mid2021: [2021, 2026], Mid2022: [2022, 2026], Mid2023: [2023, 2026],
  Mid2024: [2024, 2026], Mid2025: [2025, 2026], Mid2026: [2026, 2026],
  New2025: [2025, 2026], New2026: [2026, 2026],
}

export const CATALOG = {
  // ---------- Japanese ----------
  Acura: {
    wmi: ['19U', '19V', '5J8', '2HN'],
    models: {
      Integra: { years: Y.Mid2023, body: 'Sedan', engines: [T4('1.5', 200), T4('2.0', 320)], trims: ['Base', 'A-Spec', 'A-Spec Tech', 'Type S'] },
      TLX: { years: [2015, 2026], body: 'Sedan', engines: [T4('2.0', 272), T6('3.0', 355)], trims: ['Base', 'Technology', 'A-Spec', 'Advance', 'Type S'] },
      RDX: { years: Y.Legacy, body: 'SUV', engines: [T4('2.0', 272)], trims: ['Base', 'Technology', 'A-Spec', 'Advance'] },
      MDX: { years: Y.Legacy, body: 'SUV', engines: [V6('3.5', 290), T6('3.0', 355)], trims: ['Base', 'Technology', 'A-Spec', 'Advance', 'Type S'] },
      ZDX: { years: Y.Mid2024, body: 'SUV', engines: [EV(102, 358), EV(102, 499)], trims: ['A-Spec', 'Type S'] },
    },
  },
  Honda: {
    wmi: ['1HG', '2HG', '5FN', '5J6', '19X', 'JHM', '7FA'],
    models: {
      Accord: { years: Y.Legacy, body: 'Sedan', engines: [T4('1.5', 192), T4('2.0', 252), HY('2.0', 204)], trims: ['LX', 'EX', 'EX-L', 'Sport', 'Sport-L', 'Touring'] },
      Civic: { years: Y.Mid2016, body: 'Sedan', engines: [I4('2.0', 158), T4('1.5', 180), T4('2.0', 315)], trims: ['LX', 'Sport', 'EX', 'Touring', 'Si', 'Type R'] },
      'Civic Hatchback': { years: Y.Mid2017, body: 'Hatchback', engines: [I4('2.0', 158), T4('1.5', 180)], trims: ['LX', 'Sport', 'EX-L', 'Sport Touring'] },
      'CR-V': { years: Y.Legacy, body: 'SUV', engines: [I4('2.4', 184), T4('1.5', 190), HY('2.0', 204)], trims: ['LX', 'EX', 'EX-L', 'Sport', 'Sport-L', 'Touring'] },
      'HR-V': { years: Y.Mid2016, body: 'SUV', engines: [I4('1.8', 141), I4('2.0', 158)], trims: ['LX', 'Sport', 'EX-L'] },
      Pilot: { years: Y.Mid2016, body: 'SUV', engines: [V6('3.5', 280), V6('3.5', 285)], trims: ['Sport', 'EX-L', 'TrailSport', 'Touring', 'Black Edition', 'Elite'] },
      Passport: { years: Y.Mid2019, body: 'SUV', engines: [V6('3.5', 280), V6('3.5', 285)], trims: ['RTL', 'EX-L', 'TrailSport', 'Black Edition'] },
      Odyssey: { years: Y.Legacy, body: 'Minivan', engines: [V6('3.5', 280)], trims: ['EX', 'EX-L', 'Sport', 'Touring', 'Elite'] },
      Ridgeline: { years: Y.Mid2017, body: 'Pickup', engines: [V6('3.5', 280)], trims: ['Sport', 'RTL', 'TrailSport', 'Black Edition'] },
      Prologue: { years: Y.Mid2024, body: 'SUV', engines: [EV(85, 212), EV(85, 288)], trims: ['EX', 'Touring', 'Elite'] },
    },
  },
  Infiniti: {
    wmi: ['JN1', 'JNK', 'JNR'],
    models: {
      Q50: { years: Y.Legacy, body: 'Sedan', engines: [T6('3.0', 300), T6('3.0', 400)], trims: ['Pure', 'Luxe', 'Sensory', 'Red Sport 400'] },
      QX50: { years: Y.Mid2019, body: 'SUV', engines: [T4('2.0', 268)], trims: ['Pure', 'Luxe', 'Sensory', 'Autograph'] },
      QX55: { years: Y.Mid2022, body: 'SUV', engines: [T4('2.0', 268)], trims: ['Luxe', 'Essential', 'Sensory'] },
      QX60: { years: Y.Legacy, body: 'SUV', engines: [V6('3.5', 295)], trims: ['Pure', 'Luxe', 'Sensory', 'Autograph'] },
      QX80: { years: Y.Legacy, body: 'SUV', engines: [V8('5.6', 400), T6('3.5', 450)], trims: ['Luxe', 'Premium Select', 'Sensory', 'Autograph'] },
    },
  },
  Lexus: {
    wmi: ['JTH', 'JTJ', 'JTE'],
    models: {
      ES: { years: Y.Legacy, body: 'Sedan', engines: [V6('3.5', 302), HY('2.5', 215), I4('2.5', 203)], trims: ['ES 250', 'ES 300h', 'ES 350', 'F Sport', 'F Sport Handling', 'Luxury'] },
      IS: { years: Y.Legacy, body: 'Sedan', engines: [T4('2.0', 241), V6('3.5', 311), V8('5.0', 472)], trims: ['IS 300', 'IS 350', 'F Sport', 'F Sport Design', 'IS 500 F Sport Performance'] },
      LS: { years: Y.Legacy, body: 'Sedan', engines: [T6('3.5', 416), HY6('3.5', 354)], trims: ['LS 500', 'LS 500h', 'F Sport', 'Luxury', 'Executive'] },
      NX: { years: Y.Legacy, body: 'SUV', engines: [I4('2.5', 203), T4('2.4', 275), HY('2.5', 240), PHEV('2.5', 302)], trims: ['NX 250', 'NX 350', 'NX 350h', 'NX 450h+', 'F Sport', 'Luxury'] },
      RX: { years: Y.Legacy, body: 'SUV', engines: [T4('2.4', 275), HY('2.4', 246), HY6('3.5', 366), PHEV('2.5', 304)], trims: ['RX 350', 'RX 350h', 'RX 500h F Sport Performance', 'RX 450h+', 'Premium', 'Luxury'] },
      GX: { years: Y.Legacy, body: 'SUV', engines: [V8('4.6', 301), T6('3.4', 349)], trims: ['Premium', 'Premium+', 'Luxury', 'Luxury+', 'Overtrail', 'Overtrail+'] },
      LX: { years: Y.Legacy, body: 'SUV', engines: [V8('5.7', 383), T6('3.4', 409)], trims: ['LX 600', 'Premium', 'Luxury', 'F Sport Handling', 'Ultra Luxury'] },
      TX: { years: Y.Mid2024, body: 'SUV', engines: [T4('2.4', 275), HY('2.4', 366), PHEV('2.4', 404)], trims: ['TX 350', 'TX 500h F Sport Performance', 'TX 550h+', 'Premium', 'Luxury'] },
      RZ: { years: Y.Mid2023, body: 'SUV', engines: [EV(72, 308)], trims: ['Premium', 'Luxury'] },
    },
  },
  Mazda: {
    wmi: ['JM1', 'JM3', '3MZ'],
    models: {
      'Mazda3': { years: Y.Legacy, body: 'Sedan', engines: [I4('2.0', 155), I4('2.5', 191), T4('2.5', 250)], trims: ['2.5 S', '2.5 S Select', '2.5 S Preferred', '2.5 S Carbon Edition', '2.5 Turbo Premium Plus'] },
      'Mazda3 Hatchback': { years: Y.Legacy, body: 'Hatchback', engines: [I4('2.5', 191), T4('2.5', 250)], trims: ['2.5 S', '2.5 S Preferred', '2.5 S Carbon Edition', '2.5 Turbo Premium Plus'] },
      'CX-30': { years: Y.Mid2020, body: 'SUV', engines: [I4('2.5', 191), T4('2.5', 250)], trims: ['2.5 S', '2.5 S Select', '2.5 S Preferred', '2.5 S Carbon Edition', '2.5 Turbo Premium Plus'] },
      'CX-5': { years: Y.Legacy, body: 'SUV', engines: [I4('2.5', 187), T4('2.5', 256)], trims: ['2.5 S', '2.5 S Select', '2.5 S Preferred', '2.5 S Carbon Edition', '2.5 Turbo Premium Plus', '2.5 Turbo Signature'] },
      'CX-50': { years: Y.Mid2022, body: 'SUV', engines: [I4('2.5', 187), T4('2.5', 256), HY('2.5', 219)], trims: ['2.5 S', '2.5 S Preferred', '2.5 S Premium Plus', '2.5 Turbo Meridian Edition', '2.5 Turbo Premium Plus', 'Hybrid Preferred', 'Hybrid Premium'] },
      'CX-70': { years: Y.Mid2024, body: 'SUV', engines: [S6('3.3', 280), S6('3.3', 340), PHEV('2.5', 323)], trims: ['Preferred', 'Premium', 'Premium Plus', 'Premium Plus PHEV'] },
      'CX-90': { years: Y.Mid2024, body: 'SUV', engines: [S6('3.3', 280), S6('3.3', 340), PHEV('2.5', 323)], trims: ['Select', 'Preferred', 'Premium', 'Premium Plus', 'Turbo S Premium Plus'] },
      'MX-5 Miata': { years: Y.Mid2016, body: 'Convertible', engines: [I4('2.0', 181)], trims: ['Sport', 'Club', 'Grand Touring', 'RF Club', 'RF Grand Touring'] },
    },
  },
  Mitsubishi: {
    wmi: ['JA3', '4A3', '4A4', 'JA4'],
    models: {
      Mirage: { years: [2015, 2024], body: 'Hatchback', engines: [I3('1.2', 78)], trims: ['ES', 'LE', 'SE', 'Black Edition'] },
      Outlander: { years: Y.Mid2022, body: 'SUV', engines: [I4('2.5', 181), PHEV('2.4', 248)], trims: ['ES', 'SE', 'SEL', '20th Anniversary Edition', 'Platinum Edition'] },
      'Outlander Sport': { years: Y.Legacy, body: 'SUV', engines: [I4('2.0', 148), I4('2.4', 168)], trims: ['ES', 'LE', 'SE', 'SEL', 'Ralliart'] },
      'Eclipse Cross': { years: Y.Mid2018, body: 'SUV', engines: [T4('1.5', 152)], trims: ['ES', 'LE', 'SE', 'SEL', 'Ralliart'] },
    },
  },
  Nissan: {
    wmi: ['1N4', '1N6', '3N1', '5N1', 'JN1', 'JN8'],
    models: {
      Versa: { years: Y.Legacy, body: 'Sedan', engines: [I4('1.6', 122)], trims: ['S', 'SV', 'SR'] },
      Sentra: { years: Y.Legacy, body: 'Sedan', engines: [I4('2.0', 149)], trims: ['S', 'SV', 'SR'] },
      Altima: { years: Y.Legacy, body: 'Sedan', engines: [I4('2.5', 188), T4('2.0', 248)], trims: ['S', 'SV', 'SR', 'SL', 'Platinum'] },
      Maxima: { years: [2015, 2023], body: 'Sedan', engines: [V6('3.5', 300)], trims: ['SV', 'SR', 'Platinum'] },
      Kicks: { years: Y.Mid2018, body: 'SUV', engines: [I4('1.6', 122), I4('2.0', 141)], trims: ['S', 'SV', 'SR'] },
      Rogue: { years: Y.Legacy, body: 'SUV', engines: [I4('2.5', 181), T3('1.5', 201)], trims: ['S', 'SV', 'SL', 'Platinum', 'Rock Creek'] },
      Murano: { years: Y.Legacy, body: 'SUV', engines: [V6('3.5', 260), T4('2.0', 241)], trims: ['S', 'SV', 'SL', 'Platinum'] },
      Pathfinder: { years: Y.Legacy, body: 'SUV', engines: [V6('3.5', 284)], trims: ['S', 'SV', 'SL', 'Platinum', 'Rock Creek'] },
      Armada: { years: Y.Legacy, body: 'SUV', engines: [V8('5.6', 400), T6('3.5', 425)], trims: ['SV', 'SL', 'Platinum', 'Pro-4X'] },
      Frontier: { years: Y.Legacy, body: 'Pickup', engines: [V6('3.8', 310)], trims: ['S', 'SV', 'PRO-X', 'PRO-4X', 'SL'] },
      Titan: { years: [2016, 2024], body: 'Pickup', engines: [V8('5.6', 400)], trims: ['S', 'SV', 'Pro-4X', 'SL', 'Platinum Reserve'] },
      'Leaf': { years: Y.Legacy, body: 'Hatchback', engines: [EV(40, 147), EV(60, 214)], trims: ['S', 'SV Plus'] },
      Ariya: { years: Y.Mid2023, body: 'SUV', engines: [EV(63, 214), EV(87, 389)], trims: ['Engage', 'Venture+', 'Evolve+', 'Premiere', 'Platinum+'] },
    },
  },
  Subaru: {
    wmi: ['JF1', 'JF2', '4S3', '4S4'],
    models: {
      Impreza: { years: Y.Legacy, body: 'Hatchback', engines: [H4('2.0', 152), H4('2.5', 182)], trims: ['Base', 'Sport', 'RS'] },
      Legacy: { years: [2015, 2025], body: 'Sedan', engines: [H4('2.5', 182), T4('2.4', 260)], trims: ['Base', 'Premium', 'Sport', 'Limited', 'Touring XT'] },
      Outback: { years: Y.Legacy, body: 'SUV', engines: [H4('2.5', 182), T4('2.4', 260)], trims: ['Base', 'Premium', 'Onyx Edition', 'Limited', 'Touring', 'Wilderness'] },
      Forester: { years: Y.Legacy, body: 'SUV', engines: [H4('2.5', 180), H4('2.5', 182)], trims: ['Base', 'Premium', 'Sport', 'Limited', 'Touring', 'Wilderness'] },
      Crosstrek: { years: Y.Legacy, body: 'SUV', engines: [H4('2.0', 152), H4('2.5', 182)], trims: ['Base', 'Premium', 'Sport', 'Limited', 'Wilderness'] },
      Ascent: { years: Y.Mid2019, body: 'SUV', engines: [T4('2.4', 260)], trims: ['Base', 'Premium', 'Onyx Edition', 'Limited', 'Touring'] },
      'WRX': { years: Y.Legacy, body: 'Sedan', engines: [T4('2.4', 271)], trims: ['Base', 'Premium', 'Limited', 'GT', 'tS'] },
      'BRZ': { years: Y.Legacy, body: 'Coupe', engines: [H4('2.4', 228)], trims: ['Premium', 'Limited', 'tS'] },
      Solterra: { years: Y.Mid2023, body: 'SUV', engines: [EV(72, 215)], trims: ['Premium', 'Limited', 'Touring'] },
    },
  },
  Toyota: {
    wmi: ['JTD', 'JTE', 'JTN', '4T1', '4T3', '5TD', '5TF', '2T1', '2T3'],
    models: {
      Corolla: { years: Y.Legacy, body: 'Sedan', engines: [I4('1.8', 139), I4('2.0', 169), HY('1.8', 134)], trims: ['L', 'LE', 'SE', 'XLE', 'XSE', 'Hybrid LE', 'Hybrid SE', 'Hybrid XLE'] },
      'Corolla Hatchback': { years: Y.Mid2019, body: 'Hatchback', engines: [I4('2.0', 169)], trims: ['SE', 'XSE', 'Nightshade'] },
      'Corolla Cross': { years: Y.Mid2022, body: 'SUV', engines: [I4('2.0', 169), HY('2.0', 196)], trims: ['L', 'LE', 'XLE', 'Hybrid S', 'Hybrid SE', 'Hybrid XSE'] },
      Camry: { years: Y.Legacy, body: 'Sedan', engines: [I4('2.5', 203), V6('3.5', 301), HY('2.5', 225)], trims: ['LE', 'SE', 'XLE', 'XSE'] },
      Crown: { years: Y.Mid2023, body: 'Sedan', engines: [HY('2.5', 236), HY('2.4', 340)], trims: ['XLE', 'Limited', 'Platinum'] },
      'GR86': { years: Y.Mid2022, body: 'Coupe', engines: [H4('2.4', 228)], trims: ['Base', 'Premium', 'Trueno Edition'] },
      Prius: { years: Y.Legacy, body: 'Hatchback', engines: [HY('2.0', 194), PHEV('2.0', 220)], trims: ['LE', 'XLE', 'Limited', 'Prime SE', 'Prime XSE', 'Prime XSE Premium', 'Nightshade'] },
      Mirai: { years: [2016, 2026], body: 'Sedan', engines: [EV(0, 182)], trims: ['XLE', 'Limited'] },
      'C-HR': { years: [2018, 2022], body: 'SUV', engines: [I4('2.0', 144)], trims: ['LE', 'XLE', 'Limited', 'Nightshade'] },
      RAV4: { years: Y.Legacy, body: 'SUV', engines: [I4('2.5', 203), HY('2.5', 219), PHEV('2.5', 302)], trims: ['LE', 'XLE', 'XLE Premium', 'Adventure', 'TRD Off-Road', 'Limited', 'Woodland Edition', 'Hybrid LE', 'Hybrid XLE', 'Hybrid Woodland', 'Hybrid SE', 'Hybrid XSE', 'Hybrid Limited', 'Prime SE', 'Prime XSE'] },
      Venza: { years: [2021, 2024], body: 'SUV', engines: [HY('2.5', 219)], trims: ['LE', 'XLE', 'Limited', 'Nightshade'] },
      Highlander: { years: Y.Legacy, body: 'SUV', engines: [V6('3.5', 295), T4('2.4', 265), HY('2.5', 243)], trims: ['L', 'LE', 'XLE', 'XSE', 'Limited', 'Platinum', 'Hybrid LE', 'Hybrid XLE', 'Hybrid Bronze Edition', 'Hybrid Limited', 'Hybrid Platinum'] },
      'Grand Highlander': { years: Y.Mid2024, body: 'SUV', engines: [T4('2.4', 265), HY('2.5', 245), HY('2.4', 362)], trims: ['LE', 'XLE', 'Limited', 'Platinum', 'Hybrid XLE', 'Hybrid Limited', 'Hybrid MAX Limited', 'Hybrid MAX Platinum'] },
      '4Runner': { years: Y.Legacy, body: 'SUV', engines: [V6('4.0', 270), T4('2.4', 278), HY('2.4', 326)], trims: ['SR5', 'TRD Sport', 'TRD Sport Premium', 'TRD Off-Road', 'TRD Off-Road Premium', 'Limited', 'Platinum', 'Trailhunter', 'TRD Pro'] },
      Sequoia: { years: Y.Legacy, body: 'SUV', engines: [V8('5.7', 381), HY('3.4', 437)], trims: ['SR5', 'Limited', 'Platinum', 'TRD Pro', 'Capstone', '1794 Edition'] },
      'Land Cruiser': { years: Y.Mid2024, body: 'SUV', engines: [HY('2.4', 326)], trims: ['1958', 'Land Cruiser', 'First Edition'] },
      Tacoma: { years: Y.Mid2016, body: 'Pickup', engines: [T4('2.4', 228), T4('2.4', 278), HY('2.4', 326)], trims: ['SR', 'SR5', 'PreRunner', 'TRD Sport', 'TRD Off-Road', 'Limited', 'Trailhunter', 'TRD Pro'] },
      Tundra: { years: Y.Legacy, body: 'Pickup', engines: [T6('3.5', 358), HY('3.5', 437)], trims: ['SR', 'SR5', 'Limited', 'Platinum', '1794 Edition', 'TRD Pro', 'Capstone'] },
      Sienna: { years: Y.Legacy, body: 'Minivan', engines: [HY('2.5', 245)], trims: ['LE', 'XLE', 'XSE', 'Woodland Edition', 'Limited', 'Platinum', '25th Anniversary Edition'] },
      bZ4X: { years: Y.Mid2023, body: 'SUV', engines: [EV(71, 201), EV(72, 214)], trims: ['XLE', 'Limited', 'Nightshade'] },
    },
  },

  // ---------- Korean ----------
  Genesis: {
    wmi: ['KMH', 'KM8'],
    models: {
      G70: { years: Y.Mid2019, body: 'Sedan', engines: [T4('2.5', 300), T6('3.3', 365)], trims: ['Standard', 'Sport Advanced', 'Sport Prestige'] },
      G80: { years: Y.Mid2017, body: 'Sedan', engines: [T4('2.5', 300), T6('3.5', 375)], trims: ['Standard', 'Advanced', 'Prestige', 'Sport Advanced', 'Sport Prestige'] },
      G90: { years: Y.Mid2017, body: 'Sedan', engines: [T6('3.5', 375), T6('3.5', 409)], trims: ['3.5T', '3.5T E-Supercharger'] },
      GV60: { years: Y.Mid2023, body: 'SUV', engines: [EV(77, 314), EV(77, 429), EV(77, 429)], trims: ['Advanced', 'Performance'] },
      GV70: { years: Y.Mid2022, body: 'SUV', engines: [T4('2.5', 300), T6('3.5', 375), EV(77, 429)], trims: ['Standard', 'Advanced', 'Sport Advanced', 'Sport Prestige', 'Electrified'] },
      GV80: { years: Y.Mid2021, body: 'SUV', engines: [T4('2.5', 300), T6('3.5', 375)], trims: ['Standard', 'Advanced', 'Prestige'] },
      'GV80 Coupe': { years: Y.Mid2025, body: 'SUV', engines: [T6('3.5', 375), T6('3.5', 409)], trims: ['3.5T Advanced', '3.5T E-Supercharger'] },
    },
  },
  Hyundai: {
    wmi: ['5NP', 'KMH', '5NM', 'KM8'],
    models: {
      Accent: { years: [2015, 2022], body: 'Sedan', engines: [I4('1.6', 120)], trims: ['SE', 'SEL', 'Limited'] },
      Venue: { years: Y.Mid2020, body: 'SUV', engines: [I4('1.6', 121)], trims: ['SE', 'SEL', 'Limited'] },
      Kona: { years: Y.Mid2018, body: 'SUV', engines: [I4('2.0', 147), T4('1.6', 190), EV(64, 201)], trims: ['SE', 'SEL', 'N Line', 'Limited', 'N', 'Electric SE', 'Electric SEL', 'Electric Limited'] },
      Elantra: { years: Y.Legacy, body: 'Sedan', engines: [I4('2.0', 147), T4('1.6', 201), HY('1.6', 139), T4('2.0', 276)], trims: ['SE', 'SEL', 'SEL Sport', 'Limited', 'N Line', 'N', 'Hybrid Blue', 'Hybrid Limited'] },
      Sonata: { years: [2015, 2025], body: 'Sedan', engines: [I4('2.5', 191), T4('1.6', 180), T4('2.5', 290), HY('2.0', 192)], trims: ['SE', 'SEL', 'SEL Plus', 'Limited', 'N Line'] },
      Ioniq: { years: [2017, 2022], body: 'Hatchback', engines: [HY('1.6', 139), PHEV('1.6', 156), EV(38, 134)], trims: ['Blue', 'SE', 'SEL', 'Limited'] },
      'Ioniq 5': { years: Y.Mid2022, body: 'SUV', engines: [EV(58, 168), EV(77, 225), EV(84, 320), EV(84, 601)], trims: ['SE Standard Range', 'SE', 'SEL', 'Limited', 'XRT', 'N'] },
      'Ioniq 6': { years: Y.Mid2023, body: 'Sedan', engines: [EV(53, 149), EV(77, 225), EV(77, 320)], trims: ['SE Standard Range', 'SE', 'SEL', 'Limited'] },
      'Ioniq 9': { years: Y.Mid2025, body: 'SUV', engines: [EV(110, 215), EV(110, 303), EV(110, 422)], trims: ['SE', 'SEL', 'Limited', 'Calligraphy'] },
      Tucson: { years: Y.Legacy, body: 'SUV', engines: [I4('2.5', 187), HY('1.6', 226), PHEV('1.6', 268)], trims: ['SE', 'SEL', 'N Line', 'XRT', 'Limited', 'Hybrid Blue', 'Hybrid SEL Convenience', 'Hybrid N Line', 'Hybrid Limited', 'Plug-in Hybrid SEL', 'Plug-in Hybrid Limited'] },
      'Santa Cruz': { years: Y.Mid2022, body: 'Pickup', engines: [I4('2.5', 191), T4('2.5', 281)], trims: ['SE', 'SEL', 'XRT', 'Night', 'Limited'] },
      'Santa Fe': { years: Y.Legacy, body: 'SUV', engines: [I4('2.5', 191), T4('2.5', 277), HY('1.6', 232)], trims: ['SE', 'SEL', 'XRT', 'Limited', 'Calligraphy', 'Hybrid SEL Premium', 'Hybrid Limited', 'Hybrid Calligraphy'] },
      Palisade: { years: Y.Mid2020, body: 'SUV', engines: [V6('3.8', 291), HY('2.5', 329)], trims: ['SE', 'SEL', 'XRT', 'Limited', 'Calligraphy', 'Calligraphy Night Edition'] },
      'Nexo': { years: [2019, 2023], body: 'SUV', engines: [EV(0, 161)], trims: ['Blue', 'Limited'] },
    },
  },
  Kia: {
    wmi: ['KND', '5XY', 'KNA'],
    models: {
      Rio: { years: [2015, 2023], body: 'Sedan', engines: [I4('1.6', 120)], trims: ['LX', 'S'] },
      Forte: { years: [2015, 2025], body: 'Sedan', engines: [I4('2.0', 147), T4('1.6', 201)], trims: ['LX', 'LXS', 'GT-Line', 'GT'] },
      K4: { years: Y.Mid2025, body: 'Sedan', engines: [I4('2.0', 147), T4('1.6', 190)], trims: ['LX', 'LXS', 'EX', 'GT-Line', 'GT-Line Turbo'] },
      K5: { years: Y.Mid2021, body: 'Sedan', engines: [T4('1.6', 180), T4('2.5', 290)], trims: ['LXS', 'GT-Line', 'EX', 'GT'] },
      Stinger: { years: [2018, 2023], body: 'Sedan', engines: [T4('2.5', 300), T6('3.3', 368)], trims: ['GT-Line', 'GT1', 'GT2', 'Tribute Edition'] },
      Soul: { years: Y.Legacy, body: 'Hatchback', engines: [I4('2.0', 147)], trims: ['LX', 'S', 'EX', 'GT-Line'] },
      Niro: { years: Y.Mid2017, body: 'SUV', engines: [HY('1.6', 139), PHEV('1.6', 180), EV(64, 201)], trims: ['LX', 'EX', 'EX Premium', 'SX', 'SX Touring', 'Wave', 'Wind'] },
      Seltos: { years: Y.Mid2021, body: 'SUV', engines: [I4('2.0', 146), T4('1.6', 195)], trims: ['LX', 'S', 'EX', 'SX', 'X-Line'] },
      Sportage: { years: Y.Legacy, body: 'SUV', engines: [I4('2.5', 187), HY('1.6', 227), PHEV('1.6', 261)], trims: ['LX', 'EX', 'SX', 'SX Prestige', 'X-Line', 'X-Pro', 'X-Pro Prestige', 'Hybrid LX', 'Hybrid EX', 'Hybrid SX Prestige', 'Plug-in Hybrid X-Line', 'Plug-in Hybrid X-Line Prestige'] },
      Sorento: { years: Y.Legacy, body: 'SUV', engines: [I4('2.5', 191), T4('2.5', 281), HY('1.6', 227), PHEV('1.6', 261)], trims: ['LX', 'S', 'EX', 'SX', 'SX Prestige', 'X-Line SX Prestige', 'X-Pro SX Prestige', 'Hybrid EX', 'Hybrid SX Prestige', 'Plug-in Hybrid SX Prestige'] },
      Telluride: { years: Y.Mid2020, body: 'SUV', engines: [V6('3.8', 291)], trims: ['LX', 'S', 'EX', 'SX', 'SX Prestige', 'X-Line', 'X-Pro'] },
      Carnival: { years: Y.Mid2022, body: 'Minivan', engines: [V6('3.5', 290), HY('1.6', 242)], trims: ['LX', 'LX Seat Package', 'EX', 'SX', 'SX Prestige', 'Hybrid EX', 'Hybrid SX', 'Hybrid SX Prestige'] },
      EV6: { years: Y.Mid2022, body: 'SUV', engines: [EV(58, 167), EV(77, 225), EV(77, 320), EV(84, 576)], trims: ['Light', 'Wind', 'GT-Line', 'GT'] },
      EV9: { years: Y.Mid2024, body: 'SUV', engines: [EV(76, 215), EV(99, 379)], trims: ['Light Standard Range', 'Light Long Range', 'Wind', 'Land', 'GT-Line'] },
    },
  },

  // ---------- American ----------
  Buick: {
    wmi: ['1G4', '3G4', 'KL4'],
    models: {
      Encore: { years: [2015, 2022], body: 'SUV', engines: [T4('1.4', 138)], trims: ['Base', 'Preferred', 'Sport Touring', 'Essence'] },
      'Encore GX': { years: Y.Mid2020, body: 'SUV', engines: [T3('1.2', 137), T3('1.3', 155)], trims: ['Preferred', 'Sport Touring', 'Avenir'] },
      Envista: { years: Y.Mid2024, body: 'SUV', engines: [T3('1.2', 137)], trims: ['Preferred', 'Sport Touring', 'Avenir'] },
      Envision: { years: Y.Mid2016, body: 'SUV', engines: [T4('2.0', 228)], trims: ['Preferred', 'Sport Touring', 'Essence', 'Avenir'] },
      Enclave: { years: Y.Legacy, body: 'SUV', engines: [V6('3.6', 310), T4('2.5', 328)], trims: ['Preferred', 'Essence', 'Sport Touring', 'Avenir'] },
    },
  },
  Cadillac: {
    wmi: ['1G6', '2G6'],
    models: {
      'CT4': { years: Y.Mid2020, body: 'Sedan', engines: [T4('2.0', 237), T4('2.7', 310), T4('2.7', 472)], trims: ['Luxury', 'Premium Luxury', 'Sport', 'V-Series', 'V-Series Blackwing'] },
      'CT5': { years: Y.Mid2020, body: 'Sedan', engines: [T4('2.0', 237), T6('3.0', 335), T8('6.2', 668)], trims: ['Luxury', 'Premium Luxury', 'Sport', 'V-Series', 'V-Series Blackwing'] },
      XT4: { years: Y.Mid2019, body: 'SUV', engines: [T4('2.0', 235)], trims: ['Luxury', 'Premium Luxury', 'Sport'] },
      XT5: { years: Y.Mid2017, body: 'SUV', engines: [V6('3.6', 310), T4('2.0', 235)], trims: ['Luxury', 'Premium Luxury', 'Sport'] },
      XT6: { years: Y.Mid2020, body: 'SUV', engines: [V6('3.6', 310), T4('2.0', 235)], trims: ['Luxury', 'Premium Luxury', 'Sport'] },
      Escalade: { years: Y.Legacy, body: 'SUV', engines: [V8('6.2', 420), D6('3.0', 277), T8('6.2', 682)], trims: ['Luxury', 'Premium Luxury', 'Sport', 'Premium Luxury Platinum', 'Sport Platinum', 'V-Series'] },
      'Escalade IQ': { years: Y.Mid2025, body: 'SUV', engines: [EV(200, 680), EV(200, 750)], trims: ['Luxury 1', 'Luxury 2', 'Sport 1', 'Sport 2'] },
      'LYRIQ': { years: Y.Mid2023, body: 'SUV', engines: [EV(102, 340), EV(102, 500)], trims: ['Tech', 'Luxury', 'Sport', 'V-Series'] },
      OPTIQ: { years: Y.Mid2025, body: 'SUV', engines: [EV(85, 300)], trims: ['Luxury', 'Sport'] },
      Vistiq: { years: Y.Mid2026, body: 'SUV', engines: [EV(102, 615)], trims: ['Luxury', 'Sport', 'Premium Luxury', 'Platinum'] },
    },
  },
  Chevrolet: {
    wmi: ['1G1', '1GC', '1GN', '2G1', '3GN', '3GC', 'KL7'],
    models: {
      Trax: { years: Y.Legacy, body: 'SUV', engines: [T4('1.4', 138), T3('1.2', 137)], trims: ['LS', '1RS', 'LT', '2RS', 'ACTIV'] },
      Trailblazer: { years: Y.Mid2021, body: 'SUV', engines: [T3('1.2', 137), T3('1.3', 155)], trims: ['LS', 'LT', 'ACTIV', 'RS'] },
      Equinox: { years: Y.Legacy, body: 'SUV', engines: [T4('1.5', 170), I4('2.4', 182), EV(85, 213)], trims: ['LS', 'LT', 'RS', 'Premier', 'EV LT', 'EV RS', 'EV 2LT', 'EV 3LT'] },
      'Blazer': { years: Y.Mid2019, body: 'SUV', engines: [T4('2.0', 228), V6('3.6', 308), EV(85, 220)], trims: ['2LT', '3LT', 'RS', 'Premier', 'EV LT', 'EV RS', 'EV SS'] },
      Traverse: { years: Y.Legacy, body: 'SUV', engines: [V6('3.6', 310), T4('2.5', 328)], trims: ['LS', 'LT', 'Z71', 'RS', 'High Country'] },
      Tahoe: { years: Y.Legacy, body: 'SUV', engines: [V8('5.3', 355), V8('6.2', 420), D6('3.0', 277)], trims: ['LS', 'LT', 'RST', 'Z71', 'Premier', 'High Country'] },
      Suburban: { years: Y.Legacy, body: 'SUV', engines: [V8('5.3', 355), V8('6.2', 420), D6('3.0', 277)], trims: ['LS', 'LT', 'RST', 'Z71', 'Premier', 'High Country'] },
      Malibu: { years: [2016, 2024], body: 'Sedan', engines: [T4('1.5', 163), T4('2.0', 250)], trims: ['LS', 'RS', 'LT', 'Premier'] },
      Camaro: { years: [2015, 2024], body: 'Coupe', engines: [T4('2.0', 275), V6('3.6', 335), V8('6.2', 455), V8('6.2', 650)], trims: ['1LS', '1LT', '2LT', '3LT', '1SS', '2SS', 'ZL1', 'LT1'] },
      Corvette: { years: Y.Legacy, body: 'Coupe', engines: [V8('6.2', 495), V8('5.5', 670), HY('6.2', 655)], trims: ['Stingray 1LT', 'Stingray 2LT', 'Stingray 3LT', 'E-Ray 1LZ', 'E-Ray 2LZ', 'E-Ray 3LZ', 'Z06 1LZ', 'Z06 2LZ', 'Z06 3LZ', 'ZR1 1LZ', 'ZR1 2LZ', 'ZR1 3LZ'] },
      Colorado: { years: Y.Legacy, body: 'Pickup', engines: [T4('2.7', 237), T4('2.7', 310)], trims: ['WT', 'LT', 'Trail Boss', 'Z71', 'ZR2', 'ZR2 Bison'] },
      'Silverado 1500': { years: Y.Legacy, body: 'Pickup', engines: [V6('4.3', 285), T4('2.7', 310), V8('5.3', 355), V8('6.2', 420), D6('3.0', 305)], trims: ['WT', 'Custom', 'Custom Trail Boss', 'LT', 'RST', 'LT Trail Boss', 'LTZ', 'High Country', 'ZR2'] },
      'Silverado 2500 HD': { years: Y.Legacy, body: 'Pickup', engines: [V8('6.6', 401), D8('6.6', 470)], trims: ['WT', 'Custom', 'LT', 'LTZ', 'High Country', 'ZR2'] },
      'Silverado EV': { years: Y.Mid2024, body: 'Pickup', engines: [EV(170, 510), EV(205, 754)], trims: ['WT', 'LT', 'Trail Boss', 'RST'] },
      'Bolt EV': { years: [2017, 2023], body: 'Hatchback', engines: [EV(65, 200)], trims: ['LT', 'Premier'] },
      'Bolt EUV': { years: [2022, 2023], body: 'SUV', engines: [EV(65, 200)], trims: ['LT', 'Premier'] },
    },
  },
  Chrysler: {
    wmi: ['1C3', '2C3', '2A4'],
    models: {
      '300': { years: [2015, 2023], body: 'Sedan', engines: [V6('3.6', 292), V8('5.7', 363), V8('6.4', 485)], trims: ['Touring', 'Touring L', '300S', '300C', '300C Final Edition'] },
      Pacifica: { years: Y.Mid2017, body: 'Minivan', engines: [V6('3.6', 287), PHEV('3.6', 260)], trims: ['Touring', 'Touring L', 'Limited', 'Pinnacle', 'Hybrid Select', 'Hybrid Limited', 'Hybrid Pinnacle'] },
      Voyager: { years: Y.Mid2020, body: 'Minivan', engines: [V6('3.6', 287)], trims: ['LX'] },
    },
  },
  Dodge: {
    wmi: ['1C3', '2D4', '2C3'],
    models: {
      Charger: { years: [2015, 2023], body: 'Sedan', engines: [V6('3.6', 292), V8('5.7', 370), V8('6.4', 485), V8('6.2', 807)], trims: ['SXT', 'GT', 'R/T', 'Scat Pack', 'SRT Hellcat', 'SRT Hellcat Redeye'] },
      'Charger Daytona': { years: Y.Mid2024, body: 'Coupe', engines: [EV(100, 496), EV(100, 670)], trims: ['R/T', 'Scat Pack'] },
      Challenger: { years: [2015, 2023], body: 'Coupe', engines: [V6('3.6', 303), V8('5.7', 375), V8('6.4', 485), V8('6.2', 717)], trims: ['SXT', 'GT', 'R/T', 'R/T Scat Pack', 'SRT Hellcat', 'SRT Super Stock', 'SRT Demon 170'] },
      Durango: { years: Y.Legacy, body: 'SUV', engines: [V6('3.6', 295), V8('5.7', 360), V8('6.4', 475), V8('6.2', 710)], trims: ['SXT', 'GT', 'Citadel', 'R/T', 'SRT 392', 'SRT Hellcat'] },
      Hornet: { years: Y.Mid2023, body: 'SUV', engines: [T4('2.0', 268), PHEV('1.3', 288)], trims: ['GT', 'GT Plus', 'R/T', 'R/T Plus'] },
    },
  },
  Ford: {
    wmi: ['1FA', '1FT', '1FM', '3FA', '2FM', '1FD'],
    models: {
      Mustang: { years: Y.Legacy, body: 'Coupe', engines: [T4('2.3', 315), V8('5.0', 480), V8('5.0', 500), V8('5.2', 526)], trims: ['EcoBoost', 'EcoBoost Premium', 'GT', 'GT Premium', 'Dark Horse', 'Dark Horse Premium', 'Shelby GT500'] },
      'Mustang Mach-E': { years: Y.Mid2021, body: 'SUV', engines: [EV(72, 266), EV(91, 290), EV(91, 480)], trims: ['Select', 'Premium', 'California Route 1', 'GT', 'GT Performance Edition', 'Rally'] },
      Escape: { years: Y.Legacy, body: 'SUV', engines: [T3('1.5', 180), T4('2.0', 250), HY('2.5', 192), PHEV('2.5', 210)], trims: ['Active', 'ST-Line', 'ST-Line Select', 'ST-Line Elite', 'Platinum', 'Plug-In Hybrid'] },
      Bronco: { years: Y.Mid2021, body: 'SUV', engines: [T4('2.3', 300), T6('2.7', 330), V8('5.0', 418)], trims: ['Base', 'Big Bend', 'Black Diamond', 'Outer Banks', 'Heritage Edition', 'Badlands', 'Wildtrak', 'Heritage Limited Edition', 'Raptor', 'Stroppe Edition'] },
      'Bronco Sport': { years: Y.Mid2021, body: 'SUV', engines: [T3('1.5', 181), T4('2.0', 250)], trims: ['Big Bend', 'Free Wheeling', 'Heritage', 'Outer Banks', 'Badlands'] },
      Edge: { years: [2015, 2024], body: 'SUV', engines: [T4('2.0', 250), T6('2.7', 335)], trims: ['SE', 'SEL', 'ST-Line', 'Titanium', 'ST'] },
      Explorer: { years: Y.Legacy, body: 'SUV', engines: [T4('2.3', 300), T6('3.0', 400), HY('3.3', 318)], trims: ['Base', 'Active', 'ST-Line', 'Platinum', 'ST'] },
      Expedition: { years: Y.Legacy, body: 'SUV', engines: [T6('3.5', 400), T6('3.5', 440)], trims: ['Active', 'XLT', 'Limited', 'Timberline', 'King Ranch', 'Platinum', 'Tremor'] },
      'F-150': { years: Y.Legacy, body: 'Pickup', engines: [V6('3.3', 290), T6('2.7', 325), T6('3.5', 400), V8('5.0', 400), HY('3.5', 430), T6('3.5', 450), T6('3.5', 720)], trims: ['XL', 'STX', 'XLT', 'Lariat', 'King Ranch', 'Platinum', 'Tremor', 'Raptor', 'Raptor R'] },
      'F-150 Lightning': { years: Y.Mid2022, body: 'Pickup', engines: [EV(98, 452), EV(131, 580)], trims: ['Pro', 'XLT', 'Flash', 'Lariat', 'Platinum'] },
      'F-250 Super Duty': { years: Y.Legacy, body: 'Pickup', engines: [V8('6.8', 405), V8('7.3', 430), D8('6.7', 500)], trims: ['XL', 'XLT', 'Lariat', 'King Ranch', 'Platinum', 'Limited'] },
      'F-350 Super Duty': { years: Y.Legacy, body: 'Pickup', engines: [V8('6.8', 405), V8('7.3', 430), D8('6.7', 500)], trims: ['XL', 'XLT', 'Lariat', 'King Ranch', 'Platinum', 'Limited'] },
      Ranger: { years: Y.Mid2019, body: 'Pickup', engines: [T4('2.3', 270), T4('2.3', 315), T6('3.0', 405)], trims: ['XL', 'XLT', 'Lariat', 'Raptor'] },
      Maverick: { years: Y.Mid2022, body: 'Pickup', engines: [T4('2.0', 250), HY('2.5', 191), T4('2.3', 238)], trims: ['XL', 'XLT', 'Lariat', 'Tremor', 'Lobo'] },
      'Transit Connect': { years: [2015, 2023], body: 'Van', engines: [I4('2.0', 162), I4('2.5', 169)], trims: ['XL', 'XLT', 'Titanium'] },
      Transit: { years: Y.Legacy, body: 'Van', engines: [V6('3.5', 275), T6('3.5', 310), EV(68, 266)], trims: ['T-150', 'T-250', 'T-350', 'E-Transit Cargo'] },
    },
  },
  GMC: {
    wmi: ['1GK', '1GT', '3GT', '2GK'],
    models: {
      Terrain: { years: Y.Legacy, body: 'SUV', engines: [T4('1.5', 175)], trims: ['SLE', 'SLT', 'AT4', 'Elevation', 'Denali'] },
      Acadia: { years: Y.Mid2017, body: 'SUV', engines: [T4('2.5', 328)], trims: ['Elevation', 'AT4', 'Denali'] },
      Yukon: { years: Y.Legacy, body: 'SUV', engines: [V8('5.3', 355), V8('6.2', 420), D6('3.0', 305)], trims: ['SLE', 'SLT', 'AT4', 'AT4 Ultimate', 'Denali', 'Denali Ultimate'] },
      'Yukon XL': { years: Y.Legacy, body: 'SUV', engines: [V8('5.3', 355), V8('6.2', 420), D6('3.0', 305)], trims: ['SLE', 'SLT', 'AT4', 'Denali', 'Denali Ultimate'] },
      Canyon: { years: Y.Legacy, body: 'Pickup', engines: [T4('2.7', 310)], trims: ['Elevation', 'AT4', 'Denali', 'AT4X', 'AT4X AEV Edition'] },
      'Sierra 1500': { years: Y.Legacy, body: 'Pickup', engines: [V6('4.3', 285), T4('2.7', 310), V8('5.3', 355), V8('6.2', 420), D6('3.0', 305)], trims: ['Pro', 'SLE', 'Elevation', 'SLT', 'AT4', 'Denali', 'Denali Ultimate', 'AT4X'] },
      'Sierra 2500 HD': { years: Y.Legacy, body: 'Pickup', engines: [V8('6.6', 401), D8('6.6', 470)], trims: ['Pro', 'SLE', 'SLT', 'AT4', 'Denali', 'Denali Ultimate', 'AT4X'] },
      'Hummer EV Pickup': { years: Y.Mid2022, body: 'Pickup', engines: [EV(205, 1000), EV(170, 625)], trims: ['2X', '3X', 'Edition 1'] },
      'Hummer EV SUV': { years: Y.Mid2024, body: 'SUV', engines: [EV(170, 625), EV(205, 830)], trims: ['2X', '3X', 'Edition 1'] },
      'Sierra EV': { years: Y.Mid2024, body: 'Pickup', engines: [EV(200, 760)], trims: ['Elevation', 'Denali', 'AT4', 'AT4X', 'Edition 1'] },
    },
  },
  Jeep: {
    wmi: ['1C4', '1J4', '1J8'],
    models: {
      Compass: { years: Y.Legacy, body: 'SUV', engines: [I4('2.4', 177)], trims: ['Sport', 'Latitude', 'Latitude Lux', 'Altitude', 'Limited'] },
      Renegade: { years: [2015, 2023], body: 'SUV', engines: [T4('1.3', 177), I4('2.4', 180)], trims: ['Sport', 'Latitude', 'Altitude', 'Trailhawk', 'Limited'] },
      Cherokee: { years: [2015, 2023], body: 'SUV', engines: [I4('2.4', 180), V6('3.2', 271), T4('2.0', 270)], trims: ['Latitude', 'Latitude Plus', 'Altitude', 'Limited', 'Trailhawk', 'Overland'] },
      'Grand Cherokee': { years: Y.Legacy, body: 'SUV', engines: [V6('3.6', 293), V8('5.7', 357), PHEV('2.0', 375)], trims: ['Laredo', 'Altitude', 'Limited', 'Trailhawk', 'Overland', 'Summit', 'Summit Reserve', '4xe', 'Trailhawk 4xe', 'Overland 4xe', 'Summit 4xe'] },
      'Grand Cherokee L': { years: Y.Mid2021, body: 'SUV', engines: [V6('3.6', 293), V8('5.7', 357)], trims: ['Laredo', 'Altitude', 'Limited', 'Overland', 'Summit', 'Summit Reserve'] },
      Wrangler: { years: Y.Legacy, body: 'SUV', engines: [V6('3.6', 285), T4('2.0', 270), V8('6.4', 470), PHEV('2.0', 375), D6('3.0', 260)], trims: ['Sport', 'Sport S', 'Willys', 'Sahara', 'Rubicon', 'Rubicon X', '4xe', 'Rubicon 4xe', 'Rubicon 392', 'Rubicon 392 Final Edition'] },
      Gladiator: { years: Y.Mid2020, body: 'Pickup', engines: [V6('3.6', 285), D6('3.0', 260)], trims: ['Sport', 'Willys', 'Nighthawk', 'Mojave', 'Rubicon', 'Mojave X', 'Rubicon X'] },
      Wagoneer: { years: Y.Mid2022, body: 'SUV', engines: [V8('5.7', 392), S6('3.0', 420)], trims: ['Series II', 'Series III', 'Carbide'] },
      'Grand Wagoneer': { years: Y.Mid2022, body: 'SUV', engines: [V8('6.4', 471), S6('3.0', 510)], trims: ['Series II', 'Series III', 'Obsidian', 'Series III Obsidian'] },
      'Wagoneer S': { years: Y.Mid2025, body: 'SUV', engines: [EV(100, 600)], trims: ['Launch Edition', 'Limited'] },
      Avenger: { years: Y.Mid2026, body: 'SUV', engines: [EV(54, 154)], trims: ['Longitude', 'Altitude'] },
    },
  },
  Lincoln: {
    wmi: ['5LT', '5LM'],
    models: {
      Corsair: { years: Y.Mid2020, body: 'SUV', engines: [T4('2.0', 250), T4('2.3', 295), PHEV('2.5', 266)], trims: ['Premiere', 'Reserve', 'Grand Touring'] },
      Nautilus: { years: Y.Mid2019, body: 'SUV', engines: [T4('2.0', 250), HY('2.0', 310)], trims: ['Premiere', 'Reserve', 'Black Label'] },
      Aviator: { years: Y.Mid2020, body: 'SUV', engines: [T6('3.0', 400), PHEV('3.0', 494)], trims: ['Premiere', 'Reserve', 'Black Label', 'Grand Touring'] },
      Navigator: { years: Y.Legacy, body: 'SUV', engines: [T6('3.5', 440)], trims: ['Reserve', 'Black Label'] },
    },
  },
  Ram: {
    wmi: ['1C6', '3C6', '3D7'],
    models: {
      '1500': { years: Y.Legacy, body: 'Pickup', engines: [V6('3.6', 305), V8('5.7', 395), S6('3.0', 420), S6('3.0', 540)], trims: ['Tradesman', 'Big Horn', 'Laramie', 'Rebel', 'Limited Longhorn', 'Limited', 'Tungsten', 'RHO'] },
      '1500 Classic': { years: [2019, 2024], body: 'Pickup', engines: [V6('3.6', 305), V8('5.7', 395)], trims: ['Tradesman', 'Express', 'Warlock'] },
      '2500': { years: Y.Legacy, body: 'Pickup', engines: [V8('6.4', 410), D6('6.7', 370)], trims: ['Tradesman', 'Big Horn', 'Laramie', 'Power Wagon', 'Rebel', 'Longhorn', 'Limited'] },
      '3500': { years: Y.Legacy, body: 'Pickup', engines: [V8('6.4', 410), D6('6.7', 420)], trims: ['Tradesman', 'Big Horn', 'Laramie', 'Longhorn', 'Limited'] },
      ProMaster: { years: Y.Legacy, body: 'Van', engines: [V6('3.6', 276), EV(110, 268)], trims: ['Cargo 1500', 'Cargo 2500', 'Cargo 3500', 'EV Cargo'] },
      'ProMaster City': { years: [2015, 2022], body: 'Van', engines: [I4('2.4', 178)], trims: ['Tradesman', 'SLT', 'Wagon'] },
      '1500 REV': { years: Y.Mid2025, body: 'Pickup', engines: [EV(168, 654), EV(168, 663)], trims: ['Tradesman', 'Big Horn', 'Laramie', 'Rebel', 'Limited', 'Tungsten'] },
    },
  },
  Tesla: {
    wmi: ['5YJ', '7SA'],
    models: {
      'Model 3': { years: Y.Mid2017, body: 'Sedan', engines: [EV(60, 283), EV(79, 346), EV(82, 510)], trims: ['Long Range RWD', 'Long Range AWD', 'Performance'] },
      'Model Y': { years: Y.Mid2020, body: 'SUV', engines: [EV(60, 295), EV(79, 384), EV(82, 456)], trims: ['Long Range RWD', 'Long Range AWD', 'Performance'] },
      'Model S': { years: Y.Legacy, body: 'Sedan', engines: [EV(100, 670), EV(100, 1020)], trims: ['Dual Motor', 'Plaid'] },
      'Model X': { years: Y.Legacy, body: 'SUV', engines: [EV(100, 670), EV(100, 1020)], trims: ['Dual Motor', 'Plaid'] },
      Cybertruck: { years: Y.Mid2024, body: 'Pickup', engines: [EV(123, 318), EV(123, 600), EV(123, 845)], trims: ['Long Range RWD', 'All-Wheel Drive', 'Cyberbeast'] },
    },
  },
  Rivian: {
    wmi: ['7PD', '7FC'],
    models: {
      R1T: { years: Y.Mid2022, body: 'Pickup', engines: [EV(135, 533), EV(141, 665), EV(141, 850), EV(141, 1025)], trims: ['Dual Motor Standard', 'Dual Motor Large', 'Dual Motor Max', 'Tri Motor', 'Quad Motor'] },
      R1S: { years: Y.Mid2022, body: 'SUV', engines: [EV(135, 533), EV(141, 665), EV(141, 850), EV(141, 1025)], trims: ['Dual Motor Standard', 'Dual Motor Large', 'Dual Motor Max', 'Tri Motor', 'Quad Motor'] },
    },
  },
  Lucid: {
    wmi: ['50E'],
    models: {
      Air: { years: Y.Mid2022, body: 'Sedan', engines: [EV(88, 430), EV(118, 620), EV(118, 1050)], trims: ['Pure', 'Touring', 'Grand Touring', 'Sapphire'] },
      Gravity: { years: Y.Mid2025, body: 'SUV', engines: [EV(118, 828), EV(123, 1070)], trims: ['Touring', 'Grand Touring'] },
    },
  },

  // ---------- European ----------
  Audi: {
    wmi: ['WAU', 'TRU', 'WA1'],
    models: {
      A3: { years: Y.Legacy, body: 'Sedan', engines: [T4('2.0', 201), T4('2.0', 306)], trims: ['Premium', 'Premium Plus', 'Prestige', 'S3', 'RS 3'] },
      A4: { years: Y.Legacy, body: 'Sedan', engines: [T4('2.0', 201), T4('2.0', 261), T4('2.0', 349)], trims: ['Premium', 'Premium Plus', 'Prestige', 'S4', 'allroad'] },
      A5: { years: Y.Legacy, body: 'Coupe', engines: [T4('2.0', 201), T4('2.0', 261), T6('2.9', 444)], trims: ['Premium', 'Premium Plus', 'Prestige', 'S5', 'RS 5'] },
      A6: { years: Y.Legacy, body: 'Sedan', engines: [T4('2.0', 261), T6('3.0', 335), T8('4.0', 591)], trims: ['Premium', 'Premium Plus', 'Prestige', 'S6', 'RS 6 Avant', 'allroad'] },
      A7: { years: Y.Legacy, body: 'Sedan', engines: [T6('3.0', 335), T8('4.0', 591)], trims: ['Premium Plus', 'Prestige', 'S7', 'RS 7'] },
      A8: { years: Y.Legacy, body: 'Sedan', engines: [T6('3.0', 335), T8('4.0', 453), T8('4.0', 571)], trims: ['Base', 'L', 'S8'] },
      Q3: { years: Y.Legacy, body: 'SUV', engines: [T4('2.0', 184), T4('2.0', 228)], trims: ['Premium', 'Premium Plus', 'S line Premium Plus'] },
      Q4: { years: Y.Mid2022, body: 'SUV', engines: [EV(77, 201), EV(77, 335)], trims: ['Premium', 'Premium Plus', 'Prestige'] },
      Q5: { years: Y.Legacy, body: 'SUV', engines: [T4('2.0', 261), PHEV('2.0', 362), T6('3.0', 349)], trims: ['Premium', 'Premium Plus', 'Prestige', 'SQ5', 'Sportback'] },
      Q7: { years: Y.Legacy, body: 'SUV', engines: [T4('2.0', 261), T6('3.0', 335), T6('3.0', 349)], trims: ['Premium', 'Premium Plus', 'Prestige', 'SQ7'] },
      Q8: { years: Y.Mid2019, body: 'SUV', engines: [T6('3.0', 335), T8('4.0', 500), T8('4.0', 591)], trims: ['Premium', 'Premium Plus', 'Prestige', 'SQ8', 'RS Q8'] },
      'e-tron': { years: [2019, 2023], body: 'SUV', engines: [EV(95, 355), EV(95, 402)], trims: ['Premium', 'Premium Plus', 'Prestige'] },
      'Q8 e-tron': { years: Y.Mid2024, body: 'SUV', engines: [EV(89, 355), EV(114, 402), EV(114, 496)], trims: ['Premium', 'Premium Plus', 'Prestige', 'SQ8 e-tron'] },
    },
  },
  BMW: {
    wmi: ['WBA', 'WBS', '4US', '5UX'],
    models: {
      '2 Series': { years: Y.Legacy, body: 'Coupe', engines: [T4('2.0', 255), S6('3.0', 382), S6('3.0', 453)], trims: ['230i', 'M240i', 'M2'] },
      '3 Series': { years: Y.Legacy, body: 'Sedan', engines: [T4('2.0', 255), S6('3.0', 382), S6('3.0', 503), PHEV('2.0', 288)], trims: ['330i', 'M340i', 'M3', 'M3 Competition', '330e'] },
      '4 Series': { years: Y.Mid2021, body: 'Coupe', engines: [T4('2.0', 255), S6('3.0', 382), S6('3.0', 523)], trims: ['430i', 'M440i', 'M4', 'M4 Competition', 'M4 CS'] },
      '5 Series': { years: Y.Legacy, body: 'Sedan', engines: [T4('2.0', 255), S6('3.0', 375), PHEV('2.0', 483), EV(84, 335), EV(84, 590)], trims: ['530i', '540i', 'M550i', 'M5', '530e', 'i5 eDrive40', 'i5 M60'] },
      '7 Series': { years: Y.Legacy, body: 'Sedan', engines: [T6('3.0', 375), T8('4.4', 536), PHEV('3.0', 483)], trims: ['740i', '750e xDrive', '760i xDrive', 'M760e'] },
      i4: { years: Y.Mid2022, body: 'Sedan', engines: [EV(84, 335), EV(84, 536)], trims: ['eDrive35', 'eDrive40', 'M50'] },
      i5: { years: Y.Mid2024, body: 'Sedan', engines: [EV(84, 335), EV(84, 590)], trims: ['eDrive40', 'M60 xDrive'] },
      i7: { years: Y.Mid2023, body: 'Sedan', engines: [EV(102, 449), EV(102, 536), EV(102, 650)], trims: ['eDrive50', 'xDrive60', 'M70'] },
      X1: { years: Y.Legacy, body: 'SUV', engines: [T4('2.0', 241), T4('2.0', 312)], trims: ['xDrive28i', 'M35i'] },
      X2: { years: Y.Mid2018, body: 'SUV', engines: [T4('2.0', 241), T4('2.0', 312)], trims: ['xDrive28i', 'M35i'] },
      X3: { years: Y.Legacy, body: 'SUV', engines: [T4('2.0', 248), S6('3.0', 382), S6('3.0', 503), PHEV('2.0', 288), EV(84, 268)], trims: ['xDrive30i', 'M40i', 'M', 'M Competition', 'xDrive30e', 'iX3'] },
      X5: { years: Y.Legacy, body: 'SUV', engines: [T4('2.0', 248), S6('3.0', 375), T8('4.4', 523), PHEV('3.0', 483)], trims: ['xDrive40i', 'xDrive50e', 'M60i', 'M', 'M Competition'] },
      X6: { years: Y.Legacy, body: 'SUV', engines: [S6('3.0', 375), T8('4.4', 523)], trims: ['xDrive40i', 'M60i', 'M', 'M Competition'] },
      X7: { years: Y.Mid2019, body: 'SUV', engines: [S6('3.0', 375), T8('4.4', 523)], trims: ['xDrive40i', 'M60i', 'Alpina XB7'] },
      iX: { years: Y.Mid2022, body: 'SUV', engines: [EV(105, 516), EV(109, 610)], trims: ['xDrive50', 'xDrive60', 'M60'] },
      Z4: { years: Y.Mid2019, body: 'Convertible', engines: [T4('2.0', 255), S6('3.0', 382)], trims: ['sDrive30i', 'M40i'] },
    },
  },
  'Mercedes-Benz': {
    wmi: ['WDC', 'WDD', 'WDB', '4JG'],
    models: {
      'A-Class': { years: [2019, 2022], body: 'Sedan', engines: [T4('2.0', 188), T4('2.0', 302)], trims: ['A 220', 'A 220 4MATIC', 'AMG A 35'] },
      'C-Class': { years: Y.Legacy, body: 'Sedan', engines: [T4('2.0', 255), T4('2.0', 302), T4('2.0', 402), T8('4.0', 503)], trims: ['C 300', 'C 300 4MATIC', 'AMG C 43', 'AMG C 63 S E Performance'] },
      'E-Class': { years: Y.Legacy, body: 'Sedan', engines: [T4('2.0', 255), S6('3.0', 375), T8('4.0', 603), PHEV('2.0', 320)], trims: ['E 350', 'E 450 4MATIC', 'AMG E 53 Hybrid', 'AMG E 63 S'] },
      'S-Class': { years: Y.Legacy, body: 'Sedan', engines: [S6('3.0', 429), T8('4.0', 496), T8('6.0', 621), PHEV('3.0', 510)], trims: ['S 500 4MATIC', 'S 580 4MATIC', 'S 580e', 'Maybach S 580', 'Maybach S 680', 'AMG S 63 E Performance'] },
      'CLA': { years: Y.Legacy, body: 'Sedan', engines: [T4('2.0', 221), T4('2.0', 302), T4('2.0', 382)], trims: ['CLA 250', 'CLA 250 4MATIC', 'AMG CLA 35', 'AMG CLA 45'] },
      'CLS': { years: [2019, 2023], body: 'Sedan', engines: [S6('3.0', 362), S6('3.0', 429), T4('2.0', 429)], trims: ['CLS 450', 'AMG CLS 53'] },
      'GLA': { years: Y.Legacy, body: 'SUV', engines: [T4('2.0', 221), T4('2.0', 302), T4('2.0', 382)], trims: ['GLA 250', 'GLA 250 4MATIC', 'AMG GLA 35', 'AMG GLA 45'] },
      'GLB': { years: Y.Mid2020, body: 'SUV', engines: [T4('2.0', 221), T4('2.0', 302)], trims: ['GLB 250', 'GLB 250 4MATIC', 'AMG GLB 35'] },
      'GLC': { years: Y.Legacy, body: 'SUV', engines: [T4('2.0', 255), T4('2.0', 302), T4('2.0', 416), T4('2.0', 469), PHEV('2.0', 313)], trims: ['GLC 300', 'GLC 300 4MATIC', 'GLC 350e', 'AMG GLC 43', 'AMG GLC 63 S E Performance'] },
      'GLE': { years: Y.Legacy, body: 'SUV', engines: [T4('2.0', 255), S6('3.0', 375), T8('4.0', 603), PHEV('2.0', 381)], trims: ['GLE 350', 'GLE 450 4MATIC', 'GLE 580 4MATIC', 'GLE 450e', 'AMG GLE 53 Hybrid', 'AMG GLE 63 S'] },
      'GLS': { years: Y.Legacy, body: 'SUV', engines: [S6('3.0', 375), T8('4.0', 510), T8('4.0', 603)], trims: ['GLS 450 4MATIC', 'GLS 580 4MATIC', 'Maybach GLS 600', 'AMG GLS 63'] },
      'G-Class': { years: Y.Legacy, body: 'SUV', engines: [S6('3.0', 443), T8('4.0', 577), EV(116, 579)], trims: ['G 550', 'AMG G 63', 'G 580 with EQ Technology'] },
      EQS: { years: Y.Mid2022, body: 'Sedan', engines: [EV(108, 355), EV(108, 536), EV(108, 751)], trims: ['EQS 450+', 'EQS 450 4MATIC', 'EQS 580 4MATIC', 'AMG EQS'] },
      'EQS SUV': { years: Y.Mid2023, body: 'SUV', engines: [EV(108, 355), EV(108, 536)], trims: ['EQS 450+', 'EQS 450 4MATIC', 'EQS 580 4MATIC'] },
      EQE: { years: Y.Mid2023, body: 'Sedan', engines: [EV(90, 288), EV(90, 402), EV(90, 677)], trims: ['EQE 350+', 'EQE 350 4MATIC', 'EQE 500 4MATIC', 'AMG EQE'] },
      Sprinter: { years: Y.Legacy, body: 'Van', engines: [T4('2.0', 208), D4('2.0', 170), EV(113, 201)], trims: ['Cargo 1500', 'Cargo 2500', 'Cargo 3500', 'Crew', 'Passenger', 'eSprinter'] },
    },
  },
  Mini: {
    wmi: ['WMW'],
    models: {
      Cooper: { years: Y.Legacy, body: 'Hatchback', engines: [T3('1.5', 134), T4('2.0', 189), T4('2.0', 228), EV(28, 181), EV(49, 215)], trims: ['Cooper', 'Cooper S', 'John Cooper Works', 'Cooper SE', 'Cooper SE Favoured'] },
      Countryman: { years: Y.Legacy, body: 'SUV', engines: [T3('1.5', 134), T4('2.0', 189), T4('2.0', 300), EV(66, 308)], trims: ['Cooper S ALL4', 'John Cooper Works ALL4', 'Countryman SE ALL4'] },
    },
  },
  Porsche: {
    wmi: ['WP0', 'WP1'],
    models: {
      '911': { years: Y.Legacy, body: 'Coupe', engines: [H6('3.0', 379), H6('3.0', 443), H6('3.7', 572), H6('3.8', 640), H6('4.0', 518), HY('3.6', 532)], trims: ['Carrera', 'Carrera T', 'Carrera S', 'Carrera GTS', 'Targa 4', 'Targa 4 GTS', 'Turbo', 'Turbo S', 'GT3', 'GT3 Touring', 'GT3 RS', '911 S/T'] },
      Cayenne: { years: Y.Legacy, body: 'SUV', engines: [T6('3.0', 348), T8('4.0', 468), T8('4.0', 729), PHEV('3.0', 463), PHEV('4.0', 729)], trims: ['Base', 'E-Hybrid', 'S', 'S E-Hybrid', 'GTS', 'Turbo E-Hybrid', 'Turbo GT'] },
      Macan: { years: Y.Legacy, body: 'SUV', engines: [T4('2.0', 261), T6('2.9', 375), EV(100, 375), EV(100, 630)], trims: ['Base', 'T', 'S', 'GTS', '4', '4S', 'Turbo'] },
      Panamera: { years: Y.Legacy, body: 'Sedan', engines: [T6('2.9', 348), T6('2.9', 463), T8('4.0', 468), T8('4.0', 729)], trims: ['Base', '4', '4 E-Hybrid', '4S', '4S E-Hybrid', 'GTS', 'Turbo', 'Turbo E-Hybrid', 'Turbo S E-Hybrid'] },
      Taycan: { years: Y.Mid2020, body: 'Sedan', engines: [EV(89, 402), EV(105, 496), EV(105, 590), EV(105, 1019)], trims: ['Base', '4', '4S', 'GTS', 'Turbo', 'Turbo S', 'Turbo GT'] },
      '718 Cayman': { years: Y.Legacy, body: 'Coupe', engines: [T4('2.0', 300), T4('2.5', 350), H6('4.0', 394), H6('4.0', 493)], trims: ['Base', 'T', 'S', 'GTS 4.0', 'GT4', 'GT4 RS'] },
      '718 Boxster': { years: Y.Legacy, body: 'Convertible', engines: [T4('2.0', 300), T4('2.5', 350), H6('4.0', 394), H6('4.0', 493)], trims: ['Base', 'T', 'S', 'GTS 4.0', 'Spyder', 'Spyder RS'] },
    },
  },
  Volkswagen: {
    wmi: ['WVW', 'WV1', '3VW', '1V2'],
    models: {
      Jetta: { years: Y.Legacy, body: 'Sedan', engines: [T4('1.5', 158), T4('2.0', 228)], trims: ['S', 'Sport', 'SE', 'SEL', 'GLI Autobahn'] },
      Golf: { years: [2015, 2024], body: 'Hatchback', engines: [T4('1.4', 147), T4('2.0', 241), T4('2.0', 315)], trims: ['S', 'SE', 'GTI S', 'GTI SE', 'GTI Autobahn', 'Golf R'] },
      'GTI': { years: Y.Legacy, body: 'Hatchback', engines: [T4('2.0', 241)], trims: ['S', 'SE', 'Autobahn', '337'] },
      'Golf R': { years: Y.Legacy, body: 'Hatchback', engines: [T4('2.0', 315)], trims: ['Base', '20th Anniversary Edition'] },
      Passat: { years: [2015, 2022], body: 'Sedan', engines: [T4('2.0', 174), V6('3.6', 280)], trims: ['S', 'SE', 'R-Line', 'SEL Premium', 'GT'] },
      Arteon: { years: [2019, 2023], body: 'Sedan', engines: [T4('2.0', 268)], trims: ['SE', 'SEL R-Line', 'SEL Premium R-Line'] },
      Taos: { years: Y.Mid2022, body: 'SUV', engines: [T4('1.5', 174)], trims: ['S', 'SE', 'SEL'] },
      Tiguan: { years: Y.Legacy, body: 'SUV', engines: [T4('2.0', 184), T4('2.0', 201)], trims: ['S', 'SE', 'SE R-Line Black', 'SEL R-Line'] },
      Atlas: { years: Y.Mid2018, body: 'SUV', engines: [T4('2.0', 269), V6('3.6', 276)], trims: ['SE', 'SE with Technology', 'Peak Edition', 'SEL', 'SEL Premium R-Line'] },
      'Atlas Cross Sport': { years: Y.Mid2020, body: 'SUV', engines: [T4('2.0', 269), V6('3.6', 276)], trims: ['SE', 'SE with Technology', 'SEL', 'SEL Premium R-Line'] },
      'ID.4': { years: Y.Mid2021, body: 'SUV', engines: [EV(62, 201), EV(82, 282), EV(82, 335)], trims: ['Standard', 'S', 'Pro', 'Pro S', 'Pro S Plus', 'AWD Pro', 'AWD Pro S'] },
      'ID. Buzz': { years: Y.Mid2025, body: 'Van', engines: [EV(91, 282), EV(91, 335)], trims: ['Pro S', 'Pro S Plus', '1st Edition'] },
    },
  },
  Volvo: {
    wmi: ['YV1', 'YV4'],
    models: {
      'S60': { years: Y.Legacy, body: 'Sedan', engines: [T4('2.0', 247), T4('2.0', 295), PHEV('2.0', 455)], trims: ['Core', 'Plus', 'Ultra', 'Recharge Plus', 'Recharge Ultra', 'Polestar Engineered'] },
      'S90': { years: Y.Mid2017, body: 'Sedan', engines: [T4('2.0', 295), PHEV('2.0', 455)], trims: ['Plus', 'Ultra', 'Recharge Plus', 'Recharge Ultra'] },
      'V60 Cross Country': { years: Y.Mid2020, body: 'SUV', engines: [T4('2.0', 247)], trims: ['Plus', 'Ultra'] },
      'V90 Cross Country': { years: Y.Mid2017, body: 'SUV', engines: [T4('2.0', 295)], trims: ['Plus', 'Ultra'] },
      'XC40': { years: Y.Mid2019, body: 'SUV', engines: [T4('2.0', 247), EV(79, 402)], trims: ['Core', 'Plus', 'Ultra', 'Recharge Plus', 'Recharge Ultra'] },
      'XC60': { years: Y.Legacy, body: 'SUV', engines: [T4('2.0', 247), T4('2.0', 295), PHEV('2.0', 455)], trims: ['Core', 'Plus', 'Ultra', 'Recharge Plus', 'Recharge Ultra', 'Polestar Engineered'] },
      'XC90': { years: Y.Legacy, body: 'SUV', engines: [T4('2.0', 247), T4('2.0', 295), PHEV('2.0', 455)], trims: ['Core', 'Plus', 'Ultra', 'Recharge Plus', 'Recharge Ultra'] },
      'C40 Recharge': { years: [2022, 2024], body: 'SUV', engines: [EV(78, 402)], trims: ['Core', 'Plus', 'Ultimate'] },
      'EX30': { years: Y.Mid2025, body: 'SUV', engines: [EV(69, 268), EV(69, 422)], trims: ['Core', 'Plus', 'Ultra'] },
      'EX90': { years: Y.Mid2025, body: 'SUV', engines: [EV(107, 402), EV(107, 510)], trims: ['Plus', 'Ultra'] },
    },
  },
}

export const TRANSMISSIONS = ['Automatic', 'Manual', 'CVT', 'DCT', 'Direct Drive']

export const MAKES = Object.keys(CATALOG).sort()

export function yearsAvailable() {
  const years = new Set()
  for (const make of Object.values(CATALOG)) {
    for (const m of Object.values(make.models)) {
      for (let y = m.years[0]; y <= m.years[1]; y++) years.add(y)
    }
  }
  return [...years].sort((a, b) => b - a)
}

export function makesForYear(year) {
  return MAKES.filter((mk) => Object.values(CATALOG[mk].models).some((m) => year >= m.years[0] && year <= m.years[1]))
}

export function modelsFor(year, make) {
  const models = CATALOG[make]?.models || {}
  return Object.keys(models).filter((name) => year >= models[name].years[0] && year <= models[name].years[1])
}

export function modelInfo(make, model) {
  return CATALOG[make]?.models?.[model]
}

export function defaultTransmission(model) {
  return model?.body === 'Coupe' ? 'Manual' : 'Automatic'
}

export function vehicleLabel(v) {
  if (!v) return ''
  return `${v.year} ${v.make} ${v.model}`
}

export function vehicleSub(v) {
  if (!v) return ''
  return [v.engineLabel, v.transmission, v.trim].filter(Boolean).join(' • ')
}

export function vehicleId(v) {
  return [v.year, v.make, v.model, v.engineId, v.trim].join('|')
}

export function makeFromWmi(vin) {
  const wmi = vin.slice(0, 3).toUpperCase()
  for (const [make, data] of Object.entries(CATALOG)) {
    if (data.wmi.includes(wmi)) return make
  }
  return null
}
