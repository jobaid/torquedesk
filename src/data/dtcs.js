// Diagnostic trouble code library.
//
// Content is based on the SAE J2012 generic OBD-II code definitions (a public
// international standard, not proprietary OEM content). Specs are typical
// values for naturally-aspirated gasoline passenger vehicles; always verify
// against OEM service information before condemning a part.
//
// severity: high = stop/drive with caution, medium = repair soon, low = monitor

const d = (code, title, system, severity, description, causes, symptoms, steps, related = {}) => ({
  code, title, system, severity, description, causes, symptoms, steps,
  procedures: related.procedures || [], components: related.components || [], wiring: related.wiring || [],
})

const misfireSteps = (cyl) => [
  { title: 'Verify the concern', body: `Review freeze-frame data. Note RPM, load and engine temperature when the misfire${cyl ? ` on cylinder ${cyl}` : ''} set.` },
  { title: 'Check misfire counters', body: 'Monitor Mode $06 or live misfire counters at idle and under load to identify the affected cylinder(s).' },
  { title: cyl ? 'Swap the ignition coil' : 'Check for common causes', body: cyl ? `Swap the cylinder ${cyl} coil with an adjacent cylinder. If the misfire follows the coil, replace the coil.` : 'Random misfires on several cylinders point to a shared cause: vacuum leak, low fuel pressure, MAF contamination, or EGR flow.' },
  { title: 'Inspect the spark plug', body: 'Remove and inspect the spark plug for wear, carbon tracking, or oil fouling.', spec: 'Gap: 0.040–0.044 in' },
  { title: 'Test the fuel injector', body: 'Check injector resistance and perform an injector balance test.', spec: 'Injector resistance: 11–13 Ω' },
  { title: 'Perform a compression test', body: 'If ignition and fuel are good, test compression and leak-down.', spec: 'Min compression: 145 psi; max variation 15%' },
]

const o2Steps = (bank, pos) => [
  { title: 'Review freeze frame', body: `Record STFT/LTFT, coolant temp and RPM at the moment the code set for bank ${bank}.` },
  { title: 'Inspect the sensor and wiring', body: `Visually inspect the bank ${bank} ${pos} O2 sensor for exhaust leaks, chafed wiring and connector corrosion.` },
  { title: 'Verify heater circuit', body: 'KOEO: battery voltage on the heater +B wire. KOER: heater duty-cycling. Measure heater resistance.', spec: 'Heater resistance (cold): 5–20 Ω typical' },
  { title: 'Observe signal activity', body: pos === 'upstream'
      ? 'At operating temp and 2500 rpm, the upstream signal should cross 450 mV at ~1 Hz, swinging 100–900 mV.'
      : 'The downstream sensor should show a stable signal around 600–800 mV with little activity if the catalyst is good.' },
  { title: 'Rule out exhaust leaks', body: `A pre-sensor exhaust leak draws air in on the pulse wave and makes the sensor read lean. Inspect manifold gaskets and flex pipes on bank ${bank}.` },
  { title: 'Replace if the sensor is at fault', body: `When wiring, grounds, exhaust and fueling are confirmed good, replace the bank ${bank} ${pos} oxygen sensor.` },
]

export const DTCS = [
  // ---------- MISFIRES ----------
  d('P0300', 'Random/Multiple Cylinder Misfire Detected', 'Ignition', 'high',
    'The engine control module detected crankshaft speed fluctuations indicating misfires on more than one cylinder, or a misfire that cannot be attributed to a single cylinder.',
    ['Worn or fouled spark plugs', 'Faulty ignition coil(s)', 'Vacuum leak', 'Low fuel pressure / restricted injectors', 'Contaminated MAF sensor', 'Low compression', 'EGR valve stuck open'],
    ['Rough idle', 'Hesitation on acceleration', 'Flashing check engine light', 'Reduced fuel economy'],
    misfireSteps(), { procedures: ['spark-plugs', 'ignition-coil', 'maf-sensor'], components: ['ignition-coil', 'spark-plug', 'maf-sensor', 'ckp-sensor'], wiring: ['ignition'] }),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => d(`P030${n}`, `Cylinder ${n} Misfire Detected`, 'Ignition', 'high',
    `The ECM detected a misfire on cylinder ${n} exceeding the threshold that can cause catalyst damage or increased emissions.`,
    [`Ignition coil cylinder ${n}`, `Spark plug cylinder ${n}`, `Fuel injector cylinder ${n}`, 'Low compression on the cylinder', 'Wiring fault in coil or injector circuit'],
    ['Rough idle', 'Engine shake', 'Flashing MIL under load'],
    misfireSteps(n), { procedures: ['ignition-coil', 'spark-plugs'], components: ['ignition-coil', 'spark-plug'], wiring: ['ignition'] })),

  // ---------- IGNITION COILS ----------
  d('P0351', 'Ignition Coil A Primary/Secondary Circuit', 'Ignition', 'medium',
    'The ECM detected an open, short, or no ignition confirmation signal (IGF) from ignition coil A (cylinder 1).',
    ['Faulty ignition coil', 'Open or shorted coil control circuit', 'Poor connector terminal tension', 'ECM fault (rare)'],
    ['Misfire on cylinder 1', 'Check engine light'],
    [
      { title: 'Inspect the connector', body: 'Check the coil connector for corrosion, bent pins and poor terminal fit.' },
      { title: 'Check power and ground', body: 'With KOEO, check for battery voltage at the coil +B terminal and ground continuity.', spec: '+B: 11–14 V' },
      { title: 'Check the IGT signal', body: 'With a scope, check the IGT pulse from the ECM while cranking.', spec: 'IGT: 0–5 V pulse' },
      { title: 'Swap coil', body: 'Swap coils and recheck. Replace the coil if the code follows.' },
    ],
    { procedures: ['ignition-coil'], components: ['ignition-coil', 'ecm'], wiring: ['ignition'] }),
  ...[2, 3, 4, 5, 6, 7, 8].map((n) => d(`P035${n}`, `Ignition Coil ${String.fromCharCode(64 + n)} Primary/Secondary Circuit`, 'Ignition', 'medium',
    `The ECM detected an open, short, or no ignition confirmation signal (IGF) from ignition coil ${String.fromCharCode(64 + n)} (cylinder ${n}).`,
    [`Faulty ignition coil cylinder ${n}`, 'Open or shorted coil control circuit', 'Poor connector terminal tension', 'ECM driver fault'],
    [`Misfire on cylinder ${n}`, 'Check engine light'],
    [
      { title: 'Scan for related codes', body: `Check for P030${n} (cylinder ${n} misfire) and any other coil driver codes.` },
      { title: 'Verify coil supply voltage', body: 'KOEO: battery voltage at the coil +B pin.', spec: '+B: 11–14 V' },
      { title: 'Scope the IGT signal', body: `Back-probe the IGT wire for coil ${n} while cranking and look for a clean 0–5 V pulse.` },
      { title: 'Swap and retest', body: `Swap coil ${n} with an adjacent coil. If the fault moves, replace the coil.` },
    ],
    { procedures: ['ignition-coil'], components: ['ignition-coil'], wiring: ['ignition'] })),

  // ---------- FUEL / AIR METERING ----------
  d('P0101', 'Mass Air Flow Circuit Range/Performance', 'Fuel System', 'medium',
    'The MAF sensor signal does not agree with the calculated airflow based on throttle position, RPM and MAP.',
    ['Contaminated MAF sensing element', 'Air leak after the MAF sensor', 'Restricted air filter', 'MAF wiring issue'],
    ['Hesitation', 'Poor fuel economy', 'Hard starting'],
    [
      { title: 'Inspect the intake', body: 'Check for a dirty air filter and any leaks in the intake duct between the MAF and throttle body.' },
      { title: 'Compare MAF reading', body: 'At idle and at 2500 rpm, compare MAF g/s to expected values.', spec: 'Idle: ~1 g/s per liter displacement' },
      { title: 'Clean or replace the MAF', body: 'Clean the MAF element with MAF cleaner. Replace if readings remain out of range.' },
    ],
    { procedures: ['maf-sensor'], components: ['maf-sensor'], wiring: [] }),
  d('P0102', 'Mass Air Flow Circuit Low Input', 'Fuel System', 'medium',
    'The MAF signal voltage or frequency is below the expected range for the operating conditions.',
    ['Open MAF signal wire', 'Open MAF 5 V reference or ground', 'Failed MAF sensor', 'Air inlet obstruction'],
    ['Stalling', 'Poor power', 'Hesitation'],
    [
      { title: 'Scan live data', body: 'Compare MAF g/s to expected. If near 0, suspect an open circuit.' },
      { title: 'Check reference and ground', body: 'Confirm 5 V reference and good ground at the MAF connector.' },
      { title: 'Back-probe the signal', body: 'Signal rises with RPM. If stuck low with the sensor connected, replace the MAF.' },
    ],
    { procedures: ['maf-sensor'], components: ['maf-sensor'], wiring: [] }),
  d('P0103', 'Mass Air Flow Circuit High Input', 'Fuel System', 'medium',
    'The MAF signal is above the expected range — commonly caused by a short to voltage or an incorrectly-sized intake replacement.',
    ['Short to voltage in MAF signal wire', 'Failed MAF sensor', 'Aftermarket intake altering flow characteristics'],
    ['Rich running', 'Black exhaust smoke'],
    [
      { title: 'Compare live reading', body: 'Record idle and 2500 rpm MAF g/s and compare to expected.' },
      { title: 'Disconnect the MAF', body: 'With the MAF unplugged the signal should fall to 0 V. If still high, the signal wire is shorted to voltage.' },
      { title: 'Replace if sensor fault confirmed', body: 'Replace the MAF with the correct OEM part when wiring is good.' },
    ],
    { procedures: ['maf-sensor'], components: ['maf-sensor'], wiring: [] }),
  d('P0106', 'Manifold Absolute Pressure Circuit Range/Performance', 'Fuel System', 'medium',
    'The MAP signal does not change as expected with throttle input, or disagrees with other load inputs.',
    ['Vacuum leak', 'Restricted or disconnected MAP vacuum reference', 'Faulty MAP sensor', 'EGR valve stuck open'],
    ['Lack of power', 'Hesitation', 'Rough idle'],
    [
      { title: 'Inspect vacuum reference', body: 'Confirm the MAP sensor hose (if applicable) is intact and clear.' },
      { title: 'Compare MAP vs TPS', body: 'At WOT, MAP should rise toward barometric pressure. Idle MAP ~ 25–35 kPa at sea level.' },
      { title: 'Smoke test the intake', body: 'Rule out intake leaks and stuck-open EGR.' },
    ],
    { procedures: ['maf-sensor'], components: ['maf-sensor'], wiring: [] }),
  d('P0113', 'Intake Air Temperature Sensor Circuit High Input', 'Fuel System', 'low',
    'IAT signal above the expected range — the ECM reads as if intake air is extremely cold.',
    ['Open IAT signal wire or ground', 'Failed IAT sensor (open)', 'Loose connector'],
    ['Possible rich running when cold', 'MIL only'],
    [
      { title: 'Scan live IAT', body: 'Compare displayed IAT to ambient. If reading −40 °C, the signal is open.' },
      { title: 'Jumper the connector', body: 'Short IAT signal to ground at the connector. If IAT jumps high, replace the sensor.' },
    ], { components: ['iat-sensor'], wiring: [] }),
  d('P0118', 'Engine Coolant Temperature Circuit High Input', 'Cooling System', 'medium',
    'ECT signal above the expected range — the ECM sees the engine as extremely cold.',
    ['Open ECT signal wire', 'Failed ECT sensor', 'Poor sensor connector'],
    ['Extended cold enrichment', 'Hard warm starts', 'Cooling fan may run continuously'],
    [
      { title: 'Compare ECT readings', body: 'With a scan tool, compare ECT to IAT at a cold start — they should agree within a few degrees.' },
      { title: 'Short the signal to ground', body: 'If ECT then reads high, the sensor is open. Replace it.' },
    ], { components: ['ect-sensor'], wiring: [] }),
  d('P0128', 'Coolant Thermostat (Below Regulating Temperature)', 'Cooling System', 'low',
    'The engine coolant temperature did not reach the regulating temperature within the expected time.',
    ['Thermostat stuck open', 'Faulty ECT sensor', 'Low coolant level', 'Cooling fan running continuously'],
    ['Poor heater output', 'Temperature gauge reads low', 'Reduced fuel economy'],
    [
      { title: 'Check coolant level', body: 'Verify coolant is at the correct level.' },
      { title: 'Monitor warm-up', body: 'From a cold start, monitor ECT on the scan tool. It should rise steadily.', spec: 'Should reach 180 °F within ~10 minutes of driving' },
      { title: 'Check cooling fan', body: 'Confirm the cooling fan is not commanded on at cold start.' },
      { title: 'Replace thermostat', body: 'If ECT plateaus below 160 °F while driving, replace the thermostat.' },
    ],
    { procedures: ['thermostat', 'coolant-service'], components: ['thermostat', 'ect-sensor'], wiring: ['cooling-fan'] }),

  // ---------- O2 SENSORS ----------
  d('P0131', 'O2 Sensor Circuit Low Voltage (Bank 1 Sensor 1)', 'Emissions', 'medium',
    'Bank 1 upstream oxygen sensor voltage stayed below the lean threshold for an extended period.',
    ['Exhaust leak upstream of sensor', 'Vacuum leak', 'Low fuel pressure', 'Faulty O2 sensor', 'Short to ground in signal wire'],
    ['Lean fuel trims', 'Possible lean misfire', 'MIL on'],
    o2Steps(1, 'upstream'), { components: ['o2-sensor'], wiring: [] }),
  d('P0132', 'O2 Sensor Circuit High Voltage (Bank 1 Sensor 1)', 'Emissions', 'medium',
    'Bank 1 upstream O2 sensor signal stayed above the rich threshold.',
    ['Leaking injector', 'High fuel pressure', 'Contaminated O2 sensor', 'Short to voltage in signal wire'],
    ['Rich running', 'Black exhaust', 'MIL on'],
    o2Steps(1, 'upstream'), { components: ['o2-sensor'], wiring: [] }),
  d('P0135', 'O2 Sensor Heater Circuit (Bank 1 Sensor 1)', 'Emissions', 'low',
    'The upstream oxygen sensor heater on bank 1 is drawing incorrect current or has an open heater element.',
    ['Blown heater fuse', 'Open heater element in sensor', 'Open heater driver circuit'],
    ['MIL on', 'Slow readiness monitors'],
    [
      { title: 'Scan freeze frame', body: 'Note engine temperature and run time — heater codes often set after cold starts.' },
      { title: 'Measure heater resistance', body: 'Disconnect the sensor and measure resistance across the two heater pins.', spec: 'Typical: 5–20 Ω cold' },
      { title: 'Check heater voltage', body: 'KOER: battery voltage on heater +B wire with ground path to the ECM.' },
    ], { components: ['o2-sensor'], wiring: [] }),
  d('P0137', 'O2 Sensor Circuit Low Voltage (Bank 1 Sensor 2)', 'Emissions', 'low',
    'Bank 1 downstream oxygen sensor voltage stayed below the lean threshold.',
    ['Exhaust leak between catalyst and sensor', 'Catalyst leaking or damaged', 'Faulty downstream O2 sensor'],
    ['MIL on, otherwise driveable'], o2Steps(1, 'downstream'), { components: ['o2-sensor'], wiring: [] }),
  d('P0141', 'O2 Sensor Heater Circuit (Bank 1 Sensor 2)', 'Emissions', 'low',
    'Downstream bank 1 O2 heater fault.',
    ['Open heater element', 'Blown fuse', 'Open heater driver'],
    ['MIL on'], [
      { title: 'Measure heater resistance', body: 'Disconnect sensor; check resistance across heater pins.', spec: 'Typical: 5–20 Ω cold' },
      { title: 'Verify power/ground', body: 'KOER: battery voltage on heater +B wire; ground sourced by the ECM.' },
      { title: 'Replace sensor if open', body: 'When wiring and fuse are good but heater is open, replace the sensor.' },
    ], { components: ['o2-sensor'], wiring: [] }),
  d('P0151', 'O2 Sensor Circuit Low Voltage (Bank 2 Sensor 1)', 'Emissions', 'medium',
    'Bank 2 upstream O2 sensor voltage stayed below the lean threshold.',
    ['Vacuum/exhaust leak on bank 2', 'Low fuel pressure', 'Faulty sensor', 'Short to ground in signal wire'],
    ['Lean fuel trims bank 2', 'Possible lean misfire'],
    o2Steps(2, 'upstream'), { components: ['o2-sensor'], wiring: [] }),
  d('P0155', 'O2 Sensor Heater Circuit (Bank 2 Sensor 1)', 'Emissions', 'low',
    'Upstream bank 2 O2 sensor heater fault.',
    ['Open heater element', 'Blown heater fuse', 'Wiring fault'],
    ['MIL on'], [
      { title: 'Check fuse', body: 'Verify the correct O2 heater fuse is intact.' },
      { title: 'Measure heater resistance', body: 'Across the two heater pins at the sensor.', spec: 'Typical: 5–20 Ω cold' },
      { title: 'Replace sensor if open', body: 'With a good circuit and open heater element, replace the sensor.' },
    ], { components: ['o2-sensor'], wiring: [] }),

  // ---------- FUEL TRIM / RAIL ----------
  d('P0171', 'System Too Lean (Bank 1)', 'Fuel System', 'medium',
    'Long-term fuel trim reached its lean limit — the ECM is adding excessive fuel to maintain stoichiometric ratio on bank 1.',
    ['Vacuum leak (intake gasket, PCV hose)', 'Dirty MAF sensor', 'Low fuel pressure', 'Restricted fuel injectors', 'Exhaust leak ahead of the O2 sensor'],
    ['Rough idle', 'Hesitation', 'Possible misfire codes'],
    [
      { title: 'Review fuel trims', body: 'Check STFT and LTFT at idle and 2500 rpm. If trims improve at higher RPM, suspect a vacuum leak.', spec: 'Normal total trim: ±10%' },
      { title: 'Smoke test the intake', body: 'Perform a smoke test of the intake and PCV system.' },
      { title: 'Check fuel pressure', body: 'Measure fuel pressure and volume.', spec: '44–50 psi' },
      { title: 'Check MAF sensor', body: 'Inspect and test the MAF sensor reading.' },
    ],
    { procedures: ['maf-sensor', 'fuel-pump', 'o2-sensor-upstream'], components: ['maf-sensor', 'o2-sensor', 'fuel-pump'], wiring: [] }),
  d('P0172', 'System Too Rich (Bank 1)', 'Fuel System', 'medium',
    'Fuel trim at the rich limit — the ECM is reducing fuel to maintain stoich on bank 1.',
    ['Leaking fuel injector', 'High fuel pressure (bad regulator)', 'Contaminated MAF (reading high)', 'Stuck-open purge valve', 'Leaking fuel pressure sensor'],
    ['Rich exhaust smell', 'Black smoke', 'Reduced fuel economy', 'Fouled plugs'],
    [
      { title: 'Review fuel trims', body: 'LTFT at or near −25% confirms rich condition.' },
      { title: 'Check fuel pressure', body: 'Verify fuel pressure is within spec and bleeds down normally.' },
      { title: 'Rule out purge', body: 'Clamp or disable the EVAP purge solenoid; if trims normalize, replace the purge valve.' },
      { title: 'Injector balance', body: 'Perform an injector balance test to find a leaking injector.' },
    ], { components: ['fuel-pump', 'o2-sensor', 'maf-sensor'], wiring: [] }),
  d('P0174', 'System Too Lean (Bank 2)', 'Fuel System', 'medium',
    'Long-term fuel trim reached the lean limit on bank 2. When set with P0171, look for a cause common to both banks.',
    ['Vacuum leak', 'MAF sensor contamination', 'Low fuel pressure'],
    ['Rough idle', 'Lack of power'],
    [
      { title: 'Check both banks', body: 'If P0171 and P0174 are both present, focus on MAF, fuel pressure and large vacuum leaks.' },
      { title: 'Smoke test', body: 'Smoke test the intake manifold and PCV system.' },
    ],
    { procedures: ['maf-sensor'], components: ['maf-sensor'], wiring: [] }),
  d('P0175', 'System Too Rich (Bank 2)', 'Fuel System', 'medium',
    'Fuel trim at rich limit on bank 2. With P0172, suspect a shared cause (fuel pressure, purge valve, MAF).',
    ['High fuel pressure', 'Leaking injectors on bank 2', 'Stuck-open purge valve', 'Contaminated MAF'],
    ['Rich smell', 'Reduced economy'], [
      { title: 'Compare both banks', body: 'If both banks are rich, bias toward shared causes.' },
      { title: 'Isolate purge', body: 'Clamp the EVAP purge hose and watch trims.' },
      { title: 'Injector balance', body: 'Confirm no injector leaks on bank 2.' },
    ], { components: ['fuel-pump', 'o2-sensor'], wiring: [] }),
  d('P0087', 'Fuel Rail/System Pressure Too Low', 'Fuel System', 'high',
    'Actual fuel rail pressure is lower than the desired pressure commanded by the ECM.',
    ['Weak fuel pump', 'Clogged fuel filter', 'Fuel pump wiring high resistance', 'Faulty pressure regulator'],
    ['Stalling', 'Loss of power under load', 'Crank no start'],
    [
      { title: 'Measure fuel pressure', body: 'Connect a gauge and compare with specification under load.', spec: '44–50 psi' },
      { title: 'Voltage drop test', body: 'Check voltage at the pump connector while running.', spec: 'Max drop: 0.5 V' },
    ],
    { procedures: ['fuel-pump'], components: ['fuel-pump'], wiring: ['fuel-pump'] }),
  d('P0088', 'Fuel Rail/System Pressure Too High', 'Fuel System', 'high',
    'Actual fuel rail pressure exceeded the commanded value — common on GDI systems with a stuck high-pressure regulator.',
    ['Faulty high-pressure fuel pump regulator', 'Stuck pressure regulator (port injection)', 'Blocked fuel return line (returned systems)'],
    ['Rich running', 'Hard start', 'Fuel smell'],
    [
      { title: 'Confirm with gauge', body: 'On port injection, measure rail pressure. On GDI, trust the scan tool rail pressure PID.' },
      { title: 'Replace regulator / HPFP', body: 'Replace the pressure regulator or high-pressure fuel pump as applicable.' },
    ], { components: ['fuel-pump'], wiring: [] }),

  // ---------- EVAPORATIVE EMISSIONS ----------
  d('P0442', 'Evaporative Emission Control System Leak Detected (Small Leak)', 'Emissions', 'low',
    'The EVAP system detected a small leak (approximately 0.040 in). Most commonly a loose or failed fuel cap or small hose crack.',
    ['Loose, worn or wrong fuel cap', 'Cracked EVAP hose', 'Leaking charcoal canister or vent valve', 'Leaking purge solenoid'],
    ['MIL on, otherwise no symptoms'], [
      { title: 'Inspect the fuel cap', body: 'Clean the gasket and torque properly; replace if damaged.' },
      { title: 'Smoke test EVAP', body: 'Pressurize the EVAP system with smoke to locate the leak.', spec: 'EVAP seal pressure: ~ 7 inH2O' },
      { title: 'Test vent and purge valves', body: 'Verify both solenoids close under command and the vent opens for the test.' },
    ], { components: ['purge-valve', 'canister', 'vent-valve'], wiring: [] }),
  d('P0455', 'Evaporative Emission Control System Leak Detected (Gross Leak)', 'Emissions', 'low',
    'A large EVAP leak was detected (0.080 in or larger). Nearly always a missing/loose cap, failed hose or stuck-open vent valve.',
    ['Missing or defective fuel cap', 'Disconnected EVAP hose', 'Failed vent valve stuck open', 'Cracked charcoal canister'],
    ['MIL on', 'Fuel smell possible'], [
      { title: 'Visually inspect', body: 'Look for disconnected EVAP hoses and the fuel cap condition.' },
      { title: 'Command the vent closed', body: 'With a scan tool, close the vent valve and attempt a smoke test. If the system seals, suspect the vent valve.' },
      { title: 'Smoke the EVAP', body: 'Introduce smoke at the service port and trace the leak.' },
    ], { components: ['purge-valve', 'canister', 'vent-valve'], wiring: [] }),
  d('P0446', 'Evaporative Emission Control System Vent Control Circuit', 'Emissions', 'low',
    'The vent valve circuit or valve itself is not responding as expected.',
    ['Open or shorted vent valve wiring', 'Failed vent valve', 'Clogged vent line (common from mud/debris)'],
    ['MIL on'], [
      { title: 'Check vent valve', body: 'Measure vent valve coil resistance and verify it clicks when 12 V is applied.' },
      { title: 'Inspect vent line', body: 'Blow through the vent line to confirm it is clear.' },
      { title: 'Replace valve', body: 'Replace the vent valve if the coil is open or the valve sticks.' },
    ], { components: ['vent-valve'], wiring: [] }),
  d('P0449', 'Evaporative Emission System Vent Valve/Solenoid Circuit', 'Emissions', 'low',
    'An electrical fault was detected in the vent valve control circuit.',
    ['Open vent valve coil', 'Short to voltage or ground in control wire', 'Poor connector'],
    ['MIL on'], [
      { title: 'Check wiring', body: 'Inspect and ohm the vent valve harness for continuity.' },
      { title: 'Replace valve if coil is open', body: 'Replace the vent valve if the coil is open or shorted.' },
    ], { components: ['vent-valve'], wiring: [] }),
  d('P0401', 'Exhaust Gas Recirculation Flow Insufficient Detected', 'Emissions', 'medium',
    'EGR flow is less than expected under conditions where EGR should be commanded on.',
    ['Clogged EGR passages', 'Stuck EGR valve', 'Faulty EGR position sensor', 'Clogged DPFE / delta-pressure sensor passage'],
    ['Occasional ping under load', 'MIL on'], [
      { title: 'Command EGR open', body: 'With a scan tool, command the EGR open and watch for an idle disturbance.' },
      { title: 'Inspect passages', body: 'Remove the EGR valve and inspect the passages for carbon buildup.' },
      { title: 'Test the DPFE/sensor', body: 'Confirm the EGR position / delta-pressure sensor reads correctly across its range.' },
    ], { components: [], wiring: [] }),

  // ---------- CATALYST ----------
  d('P0420', 'Catalyst System Efficiency Below Threshold (Bank 1)', 'Emissions', 'medium',
    'The downstream O2 sensor on bank 1 is tracking the upstream too closely, indicating the catalyst is no longer converting efficiently.',
    ['Worn or contaminated catalyst', 'Exhaust leak before downstream sensor', 'Faulty downstream O2 sensor', 'Rich/lean running damaging catalyst'],
    ['MIL on', 'Rotten-egg smell under load'], [
      { title: 'Rule out exhaust leaks', body: 'A pre-sensor leak will fail this monitor even with a good cat.' },
      { title: 'Compare sensor activity', body: 'Downstream should be relatively flat (0.6–0.8 V) vs upstream swinging 0.1–0.9 V. If downstream mirrors upstream, catalyst is weak.' },
      { title: 'Verify no fuel trim issues', body: 'Correct any rich/lean condition before condemning the cat.' },
    ], { components: ['o2-sensor'], wiring: [] }),
  d('P0430', 'Catalyst System Efficiency Below Threshold (Bank 2)', 'Emissions', 'medium',
    'Same condition as P0420 but on bank 2.',
    ['Weak bank 2 catalyst', 'Exhaust leak on bank 2', 'Faulty bank 2 downstream O2 sensor'],
    ['MIL on'], [
      { title: 'Mirror P0420 diagnosis', body: 'Follow the same procedure on bank 2.' },
    ], { components: ['o2-sensor'], wiring: [] }),

  // ---------- IDLE / THROTTLE ----------
  d('P0505', 'Idle Air Control System', 'Idle Control', 'low',
    'The ECM cannot maintain the target idle speed with the available IAC adjustment.',
    ['Dirty / stuck IAC valve', 'Vacuum leak', 'Carbon in throttle body', 'Failed IAC motor (older vehicles)'],
    ['Rolling idle', 'Stalling at stops'], [
      { title: 'Rule out vacuum leaks', body: 'Smoke test the intake.' },
      { title: 'Clean the throttle body', body: 'Remove and clean the throttle plate and bore. Perform idle relearn.' },
      { title: 'Test the IAC', body: 'Command the IAC with a scan tool and verify RPM response.' },
    ], { components: [], wiring: [] }),
  d('P2135', 'Throttle/Pedal Position Sensor "A"/"B" Voltage Correlation', 'Idle Control', 'high',
    'The two throttle (or pedal) position sensors disagree beyond allowable tolerance. ECM will usually force reduced power.',
    ['Failed throttle body (TPS circuit)', 'Failed accelerator pedal position sensor', 'Harness fault between pedal/throttle and ECM'],
    ['Reduced power mode', 'Throttle warning light', 'Hesitation'], [
      { title: 'Scan live PIDs', body: 'Compare TPS1/TPS2 or APP1/APP2 through the pedal travel.' },
      { title: 'Check 5V ref and ground', body: 'Confirm both sensors share a stable 5 V reference and good ground.' },
      { title: 'Replace at component level', body: 'Replace the pedal or throttle body depending on which pair disagrees.' },
    ], { components: [], wiring: [] }),

  // ---------- CHARGING / VOLTAGE ----------
  d('P0562', 'System Voltage Low', 'Charging System', 'medium',
    'The ECM measured battery voltage below the acceptable threshold while the engine was running.',
    ['Failing alternator', 'Slipping drive belt', 'Loose or corroded battery cables', 'Weak battery'],
    ['Dim lights', 'Charge warning light', 'Hard start'], [
      { title: 'Measure charging voltage', body: 'Battery voltage at ~1500 rpm should be 13.8–14.8 V.' },
      { title: 'Voltage drop cables', body: 'Measure drop across the B+ cable and ground strap under load.', spec: 'Max drop: 0.2 V' },
      { title: 'Inspect belt / tensioner', body: 'Replace a glazed or loose belt and check tensioner tension.' },
    ], { procedures: ['alternator-rr', 'battery-test-replace'], components: [], wiring: [] }),
  d('P0620', 'Generator Control Circuit', 'Charging System', 'medium',
    'The ECM detected a fault in the alternator field/control circuit (LIN or dedicated wire, depending on vehicle).',
    ['Failed alternator regulator', 'Open LIN / control circuit', 'ECM driver fault (rare)'],
    ['Charge light on', 'Low charging voltage'], [
      { title: 'Confirm charging voltage', body: 'If low, follow the alternator R&R procedure after validating belt and cables.' },
      { title: 'Scan for related codes', body: 'U-codes alongside P0620 point to a BUS communication issue.' },
    ], { procedures: ['alternator-rr'], components: [], wiring: [] }),

  // ---------- SPEED SENSOR / CKP / CMP ----------
  d('P0335', 'Crankshaft Position Sensor "A" Circuit', 'Ignition', 'high',
    'The ECM lost or did not see a valid signal from the crankshaft position sensor.',
    ['Failed CKP sensor', 'Damaged reluctor wheel', 'Open or shorted CKP wiring', 'Metal debris on sensor tip'],
    ['Crank no-start', 'Stalling at random intervals', 'MIL on'], [
      { title: 'Scope the CKP signal', body: 'Cranking should produce a clean AC waveform (variable reluctance) or square wave (Hall).' },
      { title: 'Measure sensor resistance', body: 'For VR sensors, resistance is typically 400–1500 Ω.' },
      { title: 'Inspect sensor and tone ring', body: 'Clean the sensor tip and verify the tone ring is intact.' },
    ], { components: ['ckp-sensor'], wiring: [] }),
  d('P0340', 'Camshaft Position Sensor "A" Circuit (Bank 1 or Single Sensor)', 'Ignition', 'high',
    'The ECM detected an invalid or absent camshaft position signal.',
    ['Failed CMP sensor', 'Open or shorted CMP wiring', 'Slipped timing / damaged reluctor', 'ECM / connector fault'],
    ['Hard start', 'Long crank', 'Stalling', 'MIL on'], [
      { title: 'Scope CMP vs CKP', body: 'Compare CMP and CKP waveforms during cranking for proper synchronization.' },
      { title: 'Verify power/ground', body: 'KOEO: check 5 V reference and ground at the CMP connector.' },
      { title: 'Replace sensor', body: 'If supply and wiring are good but no signal, replace the CMP sensor.' },
    ], { components: [], wiring: [] }),
  d('P0500', 'Vehicle Speed Sensor "A"', 'Transmission', 'medium',
    'The ECM did not receive a valid vehicle speed signal under conditions where one was expected.',
    ['Failed VSS or output speed sensor', 'Open/short in VSS wiring', 'ABS module not broadcasting speed on BUS'],
    ['Speedometer inoperative', 'Harsh shifts', 'Cruise control inoperative'], [
      { title: 'Scan live speed PID', body: 'Compare displayed speed to actual while driving.' },
      { title: 'Check wiring', body: 'For hard-wired VSS, back-probe for a clean AC/square wave signal.' },
      { title: 'ABS data', body: 'If ABS reports valid wheel speeds but the ECM does not see VSS, suspect a BUS or ABS module issue.' },
    ], { components: [], wiring: [] }),

  // ---------- TRANSMISSION ----------
  d('P0700', 'Transmission Control System (MIL Request)', 'Transmission', 'medium',
    'The TCM is requesting the MIL and is storing one or more codes. Query the TCM for sub-codes.',
    ['Any P07xx/P08xx TCM-stored code'],
    ['Varies with underlying code', 'Possible harsh shifts or limp mode'],
    [
      { title: 'Query the TCM', body: 'Pull codes from the TCM to identify the sub-fault.' },
      { title: 'Repair underlying', body: 'Follow the diagnostic for the specific TCM code reported.' },
    ], { components: [], wiring: [] }),
  d('P0730', 'Incorrect Gear Ratio', 'Transmission', 'medium',
    'The TCM compared commanded gear to input/output speed ratio and found a mismatch.',
    ['Internal transmission slippage', 'Failing input or output speed sensor', 'Low ATF level', 'Shift solenoid fault'],
    ['Flares between shifts', 'Slipping under load', 'Limp mode possible'], [
      { title: 'Check ATF level and condition', body: 'Low or burnt fluid can cause slipping.' },
      { title: 'Compare input/output speeds', body: 'Verify the TCM speed PIDs with a scan tool during driving.' },
      { title: 'Pressure test', body: 'Install a line-pressure gauge and compare to spec.' },
    ], { components: [], wiring: [] }),
  d('P0740', 'Torque Converter Clutch Circuit / Open', 'Transmission', 'medium',
    'The TCC solenoid circuit is open or the lockup is not responding as commanded.',
    ['Failed TCC solenoid', 'Open/short in TCC circuit', 'Worn converter / failed internal clutch'],
    ['Soft lockup at cruise', 'Flare on 1-2 or 2-3 shifts (varies)', 'Possible shudder'], [
      { title: 'Command the TCC', body: 'With a scan tool, command TCC apply and watch for an RPM drop.' },
      { title: 'Check solenoid resistance', body: 'Compare TCC solenoid resistance to spec.' },
      { title: 'Pressure/mechanical check', body: 'If the solenoid is good, a converter replacement may be required.' },
    ], { components: [], wiring: [] }),

  // ---------- NETWORK / U-CODES ----------
  d('U0100', 'Lost Communication With ECM/PCM "A"', 'Network', 'high',
    'The reporting module stopped seeing valid messages from the ECM on the BUS.',
    ['ECM powered off (fuse/relay)', 'Open or shorted CAN bus', 'Failed ECM', 'Terminated resistor missing/open'],
    ['Multiple warning lights', 'No-communication with ECM on scan tool', 'Crank no-start possible'], [
      { title: 'Verify ECM power', body: 'Check ECM fuses and ignition-switched power/ground.' },
      { title: 'Measure CAN voltage', body: 'KOEO: CAN-H ~ 2.5–3.5 V, CAN-L ~ 1.5–2.5 V. KOEO (no comm): both pins at 2.5 V.' },
      { title: 'Check terminating resistors', body: 'With ignition off and battery disconnected, resistance across CAN-H/CAN-L should be ~60 Ω.' },
    ], { components: [], wiring: [] }),
  d('U0101', 'Lost Communication With TCM', 'Network', 'high',
    'Another module cannot see the TCM on the BUS.',
    ['TCM power/ground fault', 'TCM internal failure', 'CAN wiring fault'],
    ['Transmission in limp mode', 'No scan-tool communication with TCM'], [
      { title: 'Check TCM power/ground', body: 'Verify the TCM has B+, ignition and ground.' },
      { title: 'CAN continuity', body: 'Follow the generic U-code CAN diagnostic (resistance, voltages).' },
    ], { components: [], wiring: [] }),
  d('U0121', 'Lost Communication With ABS Control Module', 'Network', 'high',
    'Modules cannot see the ABS/EBCM on the BUS.',
    ['ABS module power/ground fault', 'Failed ABS module', 'CAN wiring to ABS'],
    ['ABS, TC and sometimes ESC warning lights'], [
      { title: 'Verify ABS power', body: 'Check the ABS main fuse and ground.' },
      { title: 'Check CAN at ABS', body: 'Measure CAN-H/CAN-L at the ABS connector.' },
    ], { components: [], wiring: [] }),
]

const PREFIX = { P: 'Powertrain', B: 'Body', C: 'Chassis', U: 'Network' }
const SUBSYS = {
  '1': 'Fuel & air metering', '2': 'Fuel & air metering (injector circuit)', '3': 'Ignition system or misfire',
  '4': 'Auxiliary emission controls', '5': 'Vehicle speed, idle control & auxiliary inputs',
  '6': 'Computer & output circuits', '7': 'Transmission', '8': 'Transmission', '9': 'Transmission / TCM', '0': 'Fuel, air metering & auxiliary emissions',
}

/** Explains the structure of any DTC even when it isn't in the library. */
export function explainCode(raw) {
  const code = (raw || '').toUpperCase().trim()
  if (!/^[PBCU][0-3][0-9A-F]{3}$/.test(code)) return null
  return {
    code,
    system: PREFIX[code[0]],
    type: code[1] === '0' || code[1] === '2' ? 'Generic (SAE)' : 'Manufacturer-specific',
    subsystem: code[0] === 'P' ? SUBSYS[code[2]] : null,
  }
}

export function normalizeDtc(raw) {
  return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export const DTC_INDEX = Object.fromEntries(DTCS.map((d) => [d.code, d]))
