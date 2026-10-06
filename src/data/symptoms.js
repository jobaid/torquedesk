// Guided, symptom-based diagnostic trees.
//
// Content is based on standard automotive electrical and mechanical
// troubleshooting procedures (public-domain mechanical knowledge, not
// proprietary OEM service information). Specs are typical for
// late-model naturally-aspirated gasoline passenger vehicles; always
// verify against OEM service info before condemning a part.
//
// Node shape: { q, help?, spec?, yes, no } or terminal { result, detail,
//              procedures?, dtcs?, severity }

export const SYMPTOMS = [
  // ============================================================= STARTING
  {
    id: 'no-crank', title: 'Engine does not crank', system: 'Starting System', icon: 'battery',
    summary: 'Turning the key or pressing START produces no cranking, or only a click.',
    start: 'n1',
    nodes: {
      n1: { q: 'Is battery open-circuit voltage 12.4 V or higher?', help: 'Measure across the battery posts with the ignition OFF.', spec: 'Fully charged: ≥ 12.6 V', yes: 'n2', no: 'r-battery' },
      n2: { q: 'Do the dash lights stay bright while attempting to crank?', help: 'If lights dim heavily, there is high current draw or high resistance.', yes: 'n3', no: 'n4' },
      n3: { q: 'Is battery voltage present at the starter S-terminal during crank command?', help: 'Back-probe the S-terminal and have an assistant command START.', spec: '≥ 10 V', yes: 'r-starter', no: 'n5' },
      n4: { q: 'Is voltage drop across the positive or negative cable greater than 0.5 V during crank?', yes: 'r-cables', no: 'r-starter-draw' },
      n5: { q: 'Is the shifter in Park/Neutral and does the scan tool show P/N switch = ON?', yes: 'r-relay', no: 'r-pnp' },
      'r-battery': { result: 'Charge and test the battery', detail: 'A discharged battery cannot crank the engine. Charge and load test. If it fails, replace it, then test the charging system.', procedures: ['battery-test-replace', 'alternator-rr'], dtcs: ['P0562'], severity: 'medium' },
      'r-starter': { result: 'Replace the starter motor', detail: 'Starter receives command voltage but does not crank — internal starter fault.', procedures: ['starter-rr'], severity: 'medium' },
      'r-cables': { result: 'Repair cable or ground connection', detail: 'Excessive voltage drop indicates corroded terminals, a loose ground strap or damaged cable.', procedures: ['battery-test-replace'], severity: 'low' },
      'r-starter-draw': { result: 'Starter drawing excessive current', detail: 'Lights dim with good cables — starter has internal short or engine is mechanically seized. Check engine rotates by hand.', procedures: ['starter-rr'], severity: 'high' },
      'r-relay': { result: 'Diagnose starter relay & control circuit', detail: 'No S-terminal voltage with valid P/N input. Swap starter relay and check ECM STA output.', dtcs: ['P0615'], severity: 'medium' },
      'r-pnp': { result: 'Adjust or replace Park/Neutral switch', detail: 'ECM does not see Park/Neutral. Adjust the switch or check its circuit.', severity: 'low' },
    },
  },
  {
    id: 'cranks-no-start', title: 'Engine cranks but does not start', system: 'Starting System', icon: 'gauge',
    summary: 'Starter spins the engine over at normal speed but the engine never catches.',
    start: 'n1',
    nodes: {
      n1: { q: 'With the key in ON, do you hear the fuel pump prime for about 2 seconds?', yes: 'n2', no: 'r-pump-prime' },
      n2: { q: 'Is fuel pressure within spec while cranking?', spec: 'Typical port injection: 44–50 psi; GDI low-pressure: 55–75 psi', yes: 'n3', no: 'r-fuel-pressure' },
      n3: { q: 'Is there spark at a known-good spark tester on a removed coil?', yes: 'n4', no: 'r-spark' },
      n4: { q: 'Does the scan tool show RPM climbing to 200+ while cranking?', help: 'No RPM reading often means the CKP sensor failed or the timing is skipped.', yes: 'n5', no: 'r-ckp' },
      n5: { q: 'Does starting fluid make the engine fire briefly?', yes: 'r-fuel-delivery', no: 'r-compression' },
      'r-pump-prime': { result: 'Diagnose fuel pump power circuit', detail: 'No prime: check pump fuse, relay and the inertia switch (if equipped) before condemning the pump.', procedures: ['fuel-pump'], dtcs: ['P0087', 'P0230'], severity: 'high' },
      'r-fuel-pressure': { result: 'Repair the fuel delivery system', detail: 'Low or no fuel pressure: inspect the filter, pressure regulator and run a current/voltage test on the pump.', procedures: ['fuel-pump'], dtcs: ['P0087'], severity: 'high' },
      'r-spark': { result: 'Diagnose the ignition system', detail: 'No spark: scope the CMP/CKP signals, verify coil power/ground and IGT drive from the ECM.', dtcs: ['P0351', 'P0335', 'P0340'], severity: 'high' },
      'r-ckp': { result: 'Replace or repair the crankshaft position sensor', detail: 'No RPM signal while cranking — the ECM cannot schedule injection or spark without CKP.', dtcs: ['P0335'], severity: 'high' },
      'r-fuel-delivery': { result: 'Fuel reaching cylinders is inadequate', detail: 'Fires on starter fluid but not on its own fuel: inspect injectors, GDI HPFP, and verify fuel is reaching the cylinders.', dtcs: ['P0088', 'P0171'], severity: 'high' },
      'r-compression': { result: 'Mechanical compression / timing fault', detail: 'Spark + fuel + no fire = compression or valve timing problem. Perform compression and leak-down tests, verify cam timing.', severity: 'high' },
    },
  },
  {
    id: 'hard-start', title: 'Hard start / long crank', system: 'Starting System', icon: 'gauge',
    summary: 'Engine eventually starts but takes several seconds of cranking.',
    start: 'n1',
    nodes: {
      n1: { q: 'Is the hard start only after sitting overnight (cold)?', yes: 'n2', no: 'n3' },
      n2: { q: 'Does fuel pressure bleed down to zero within 10 minutes of shutdown?', spec: 'Residual pressure should hold ~ 30 min', yes: 'r-leakdown', no: 'r-cold-enrich' },
      n3: { q: 'Does the hard start only happen when the engine is hot?', yes: 'n4', no: 'n5' },
      n4: { q: 'Does cycling the key 3 times before cranking help?', yes: 'r-check-valve', no: 'r-hot-vapor' },
      n5: { q: 'Are there any stored misfire or CKP/CMP codes?', yes: 'r-codes', no: 'r-general' },
      'r-leakdown': { result: 'Fuel pressure leak-down', detail: 'Pressure not held: inspect the injectors for leakage and the check valve in the pump assembly. On GDI, HPFP leak is also possible.', procedures: ['fuel-pump'], dtcs: ['P0088', 'P0172'], severity: 'medium' },
      'r-cold-enrich': { result: 'Cold enrichment or ECT fault', detail: 'Check ECT and IAT PIDs against ambient. A high-reading ECT prevents cold enrichment and causes long cranks.', dtcs: ['P0118', 'P0128'], severity: 'low' },
      'r-check-valve': { result: 'Replace the fuel pump check valve', detail: 'Cycling the key priming helps — the pump check valve leaks down. Replace the pump module.', procedures: ['fuel-pump'], severity: 'medium' },
      'r-hot-vapor': { result: 'Hot-soak vapor lock / weak injector seal', detail: 'Hot restart issue typically from leaking injector o-rings or fuel vaporizing in the rail. Inspect injectors and insulation.', severity: 'medium' },
      'r-codes': { result: 'Follow the stored DTCs', detail: 'Diagnose misfire or CKP/CMP codes first — they will often explain the long crank.', dtcs: ['P0300', 'P0335', 'P0340'], severity: 'medium' },
      'r-general': { result: 'General starting system check', detail: 'With no stored codes, verify battery condition, cranking RPM, fuel pressure during crank, and spark delivery.', severity: 'low' },
    },
  },

  // ============================================================ RUNNING
  {
    id: 'rough-idle', title: 'Rough idle / misfire', system: 'Engine', icon: 'gauge',
    summary: 'Engine shakes at idle, stumbles, or the check engine light flashes.',
    start: 'n1',
    nodes: {
      n1: { q: 'Are misfire DTCs (P0300–P0308) stored?', yes: 'n2', no: 'n4' },
      n2: { q: 'Is the misfire isolated to one cylinder?', help: 'Check Mode $06 misfire counters.', yes: 'n3', no: 'n5' },
      n3: { q: 'After swapping that coil with another cylinder, did the misfire move?', yes: 'r-coil', no: 'n6' },
      n6: { q: 'Is the spark plug worn, fouled or cracked?', yes: 'r-plug', no: 'r-injector-compression' },
      n5: { q: 'Are long-term fuel trims greater than +10% at idle?', spec: 'Normal: ±10%', yes: 'r-vacuum', no: 'r-random' },
      n4: { q: 'Is idle speed unstable or hunting?', yes: 'r-throttle', no: 'r-mounts' },
      'r-coil': { result: 'Replace the ignition coil', detail: 'Misfire followed the coil. Replace the coil and clear codes.', procedures: ['ignition-coil'], dtcs: ['P0301', 'P0351'], severity: 'medium' },
      'r-plug': { result: 'Replace spark plugs', detail: 'Replace all plugs as a set and inspect for causes of fouling.', procedures: ['spark-plugs'], dtcs: ['P0300'], severity: 'medium' },
      'r-injector-compression': { result: 'Test injector and compression', detail: 'Ignition checks good. Perform injector balance test, then compression and leak-down on the affected cylinder.', dtcs: ['P0300'], severity: 'high' },
      'r-vacuum': { result: 'Locate vacuum leak', detail: 'Lean trims with random misfire indicate unmetered air. Smoke test intake and PCV. Also check MAF.', procedures: ['maf-sensor'], dtcs: ['P0171', 'P0174'], severity: 'medium' },
      'r-random': { result: 'Check fuel pressure & EGR', detail: 'Random misfire with normal trims: check fuel pressure under load and verify EGR valve closes at idle.', procedures: ['fuel-pump'], dtcs: ['P0087', 'P0401'], severity: 'medium' },
      'r-throttle': { result: 'Clean throttle body and relearn idle', detail: 'Carbon buildup causes unstable idle. Clean the throttle body and perform idle relearn.', dtcs: ['P0505'], severity: 'low' },
      'r-mounts': { result: 'Inspect engine mounts', detail: 'Engine runs smoothly but vibration is felt — worn engine/transmission mounts transmit vibration.', severity: 'low' },
    },
  },
  {
    id: 'cel-steady', title: 'Check engine light on (steady)', system: 'Engine', icon: 'gauge',
    summary: 'MIL lit solid (not flashing) with the engine otherwise running normally.',
    start: 'n1',
    nodes: {
      n1: { q: 'Did you scan for DTCs?', yes: 'n2', no: 'r-scan' },
      n2: { q: 'Is any P0171, P0174, P0300–P0308 code set?', yes: 'r-driveability', no: 'n3' },
      n3: { q: 'Is any P0420 or P0430 (catalyst efficiency) set?', yes: 'r-cat', no: 'n4' },
      n4: { q: 'Is any P0442 / P0455 / P0446 (EVAP) set?', yes: 'r-evap', no: 'n5' },
      n5: { q: 'Does the code list include O2 heater (P0135, P0141, P0155) only?', yes: 'r-o2-heater', no: 'r-other' },
      'r-scan': { result: 'Pull the stored codes first', detail: 'Scan all modules. Record freeze-frame data. Diagnose the oldest / highest-priority code first.', severity: 'low' },
      'r-driveability': { result: 'Driveability code found', detail: 'A fuel-trim or misfire code is driving the MIL. See the matching symptom tree (rough idle, hesitation) and diagnose.', dtcs: ['P0171', 'P0300'], severity: 'medium' },
      'r-cat': { result: 'Catalyst efficiency fault', detail: 'Before condemning the catalyst, rule out upstream causes: exhaust leaks, failed downstream O2, long-term rich/lean conditions.', dtcs: ['P0420', 'P0430'], severity: 'medium' },
      'r-evap': { result: 'EVAP leak', detail: 'Inspect the fuel cap first, then smoke-test the EVAP system. Vent and purge valves are the most common failures.', dtcs: ['P0442', 'P0455', 'P0446'], severity: 'low' },
      'r-o2-heater': { result: 'Replace the oxygen sensor(s)', detail: 'Heater element failed. Measure heater resistance on the affected sensor and replace.', dtcs: ['P0135', 'P0141', 'P0155'], severity: 'low' },
      'r-other': { result: 'Diagnose per stored code', detail: 'Follow the stored DTC definition and freeze-frame data to localize the fault.', severity: 'medium' },
    },
  },
  {
    id: 'hesitation', title: 'Hesitation / stumble on acceleration', system: 'Engine', icon: 'gauge',
    summary: 'Engine stumbles, flat-spots or loses power when the throttle opens.',
    start: 'n1',
    nodes: {
      n1: { q: 'Does the problem go away when the engine is cold?', yes: 'r-cold-only', no: 'n2' },
      n2: { q: 'Does fuel pressure stay in spec under load?', spec: '44–50 psi (typical port injection)', yes: 'n3', no: 'r-fuel-pressure' },
      n3: { q: 'Are long-term fuel trims above +15% at cruise?', yes: 'r-lean', no: 'n4' },
      n4: { q: 'Does the MAF g/s read within spec at 2500 rpm?', help: 'Rule of thumb: ~1 g/s per liter of displacement at idle; proportional at higher RPM.', yes: 'n5', no: 'r-maf' },
      n5: { q: 'Is there a stored P0401 (EGR flow insufficient)?', yes: 'r-egr', no: 'r-tps-throttle' },
      'r-cold-only': { result: 'Cold-enrichment issue', detail: 'Issue only when cold: check ECT sensor and short-term fuel trims during warm-up.', dtcs: ['P0118'], severity: 'low' },
      'r-fuel-pressure': { result: 'Fuel delivery fault', detail: 'Pressure drops under load: suspect weak pump, clogged filter or restricted injectors.', procedures: ['fuel-pump'], dtcs: ['P0087'], severity: 'medium' },
      'r-lean': { result: 'Lean condition', detail: 'High positive LTFT: smoke-test intake, verify MAF, check fuel pressure and injector flow.', dtcs: ['P0171', 'P0174'], severity: 'medium' },
      'r-maf': { result: 'Clean or replace MAF sensor', detail: 'Low or inconsistent MAF reading: clean the sensing element, replace if cleaning does not restore it.', procedures: ['maf-sensor'], dtcs: ['P0101'], severity: 'medium' },
      'r-egr': { result: 'EGR flow fault', detail: 'Clean the EGR passages, inspect the EGR valve, verify the DPFE/position sensor reads correctly.', dtcs: ['P0401'], severity: 'medium' },
      'r-tps-throttle': { result: 'Throttle / TPS fault', detail: 'Scan TPS1/TPS2 or APP1/APP2 through pedal travel. Any dropout or disagreement will cause hesitation.', dtcs: ['P2135'], severity: 'medium' },
    },
  },
  {
    id: 'overheating', title: 'Engine overheating', system: 'Cooling System', icon: 'thermometer',
    summary: 'Temperature gauge high, coolant boiling or loss of coolant.',
    start: 'n1',
    nodes: {
      n1: { q: 'Is the coolant level correct when the engine is cold?', yes: 'n2', no: 'n5' },
      n2: { q: 'Does the cooling fan turn on when commanded with a scan tool?', yes: 'n3', no: 'r-fan' },
      n3: { q: 'Is the upper radiator hose hot while the lower hose stays cold at operating temp?', yes: 'r-thermostat', no: 'n4' },
      n4: { q: 'Does a combustion leak (block) test detect exhaust gas in the coolant?', yes: 'r-headgasket', no: 'r-radiator' },
      n5: { q: 'Does the system hold 15 psi for 2 minutes in a pressure test?', yes: 'r-internal', no: 'r-leak' },
      'r-fan': { result: 'Diagnose cooling fan circuit', detail: 'Check fan fuse, relay and motor. Use the cooling fan wiring diagram.', dtcs: ['P0217'], severity: 'high' },
      'r-thermostat': { result: 'Replace the thermostat', detail: 'Thermostat stuck closed — coolant is not flowing to the radiator.', procedures: ['thermostat'], dtcs: ['P0217'], severity: 'high' },
      'r-headgasket': { result: 'Head gasket failure suspected', detail: 'Combustion gases in coolant. Confirm with cylinder leak-down test.', severity: 'high' },
      'r-radiator': { result: 'Inspect radiator & water pump', detail: 'Check for a restricted radiator and water pump impeller erosion.', procedures: ['water-pump', 'coolant-service'], severity: 'high' },
      'r-internal': { result: 'Check for internal coolant loss', detail: 'No external leak. Check oil for coolant and exhaust for white smoke.', severity: 'high' },
      'r-leak': { result: 'Locate and repair external leak', detail: 'Inspect hoses, water pump weep hole, radiator and heater core connections.', procedures: ['water-pump'], severity: 'high' },
    },
  },

  // ============================================================ CHARGING
  {
    id: 'not-charging', title: 'Battery not charging / battery light on', system: 'Charging System', icon: 'zap',
    summary: 'Charging warning lamp on, dim lights, or battery repeatedly goes flat.',
    start: 'n1',
    nodes: {
      n1: { q: 'Does the battery pass a conductance/load test?', yes: 'n2', no: 'r-battery' },
      n2: { q: 'Is charging voltage between 13.8 and 14.8 V at 1500 rpm?', spec: '13.8–14.8 V', yes: 'n3', no: 'n4' },
      n3: { q: 'Is parasitic draw above 50 mA after modules sleep?', yes: 'r-draw', no: 'r-ok' },
      n4: { q: 'Is the drive belt intact and properly tensioned?', yes: 'n5', no: 'r-belt' },
      n5: { q: 'Is voltage drop on the B+ output cable less than 0.2 V under load?', yes: 'r-alt', no: 'r-cable' },
      'r-battery': { result: 'Replace the battery', detail: 'Battery fails test. Replace and register, then retest charging output.', procedures: ['battery-test-replace'], severity: 'medium' },
      'r-draw': { result: 'Locate parasitic draw', detail: 'Pull fuses one at a time (or measure voltage drop across fuses) to isolate the circuit.', severity: 'low' },
      'r-ok': { result: 'Charging system OK', detail: 'Battery and charging system test normal. Check for a TSB on charge lamp calibration.', dtcs: ['P0562'], severity: 'low' },
      'r-belt': { result: 'Replace drive belt / tensioner', detail: 'A slipping or broken belt prevents alternator output.', procedures: ['serpentine-belt'], severity: 'medium' },
      'r-alt': { result: 'Replace the alternator', detail: 'Wiring and belt good, output low — internal alternator fault.', procedures: ['alternator-rr'], dtcs: ['P0562', 'P0620'], severity: 'medium' },
      'r-cable': { result: 'Repair output cable / fuse', detail: 'High resistance in the B+ circuit. Inspect the MEGA fuse and cable terminals.', severity: 'medium' },
    },
  },

  // ============================================================ BRAKES
  {
    id: 'brake-noise', title: 'Noise when braking', system: 'Brakes', icon: 'gauge',
    summary: 'Squeal, grind, groan or metal-on-metal when the brake pedal is applied.',
    start: 'n1',
    nodes: {
      n1: { q: 'Is the noise a sharp metal-on-metal grinding?', yes: 'r-grind', no: 'n2' },
      n2: { q: 'Is it a high-pitched squeal that stops when braking hard?', yes: 'r-wear-indicator', no: 'n3' },
      n3: { q: 'Does the noise only happen on cold or damp mornings?', yes: 'r-surface-rust', no: 'n4' },
      n4: { q: 'Is there pulsation in the pedal with the noise?', yes: 'r-warped', no: 'r-glazed' },
      'r-grind': { result: 'Replace pads immediately — rotor damage likely', detail: 'Metal-on-metal means pad backing plate is contacting rotor. Replace pads; rotor is almost always too damaged to re-use. Inspect caliper for seized slide pins.', severity: 'high' },
      'r-wear-indicator': { result: 'Replace brake pads (wear indicator)', detail: 'The spring-steel wear indicator is contacting the rotor — pads are at the service limit. Replace pads and resurface or replace rotors as needed.', severity: 'medium' },
      'r-surface-rust': { result: 'Surface rust — monitor', detail: 'Overnight condensation leaves surface rust that typically wears off in the first few stops. If it does not clear, inspect further.', severity: 'low' },
      'r-warped': { result: 'Resurface or replace rotors', detail: 'Pedal pulsation with noise indicates rotor thickness variation. Measure runout and thickness variation; resurface if within discard spec, otherwise replace.', spec: 'Typical TIR limit: ≤ 0.002 in', severity: 'medium' },
      'r-glazed': { result: 'Glazed pads / contaminated friction surface', detail: 'Deglaze rotors with sandpaper, replace pads if contaminated with fluid or grease. Inspect caliper for leaks.', severity: 'medium' },
    },
  },
  {
    id: 'abs-light', title: 'ABS warning light on', system: 'Brakes', icon: 'gauge',
    summary: 'The amber ABS lamp is lit but the red brake warning may or may not be on.',
    start: 'n1',
    nodes: {
      n1: { q: 'Is the red brake warning light also on?', yes: 'r-both-lights', no: 'n2' },
      n2: { q: 'Scan the ABS module. Is there a wheel-speed sensor code (C0035–C0050 range)?', yes: 'r-wss', no: 'n3' },
      n3: { q: 'Is there a U-code (U0121 or similar lost-communication)?', yes: 'r-comm', no: 'n4' },
      n4: { q: 'Does the ABS module itself report an internal fault (C0110, C0121)?', yes: 'r-module', no: 'r-generic' },
      'r-both-lights': { result: 'Check brake fluid level first', detail: 'Both lights usually means low brake fluid or a parking-brake switch stuck on. Top up fluid and inspect for leaks before diving into ABS diagnosis.', severity: 'high' },
      'r-wss': { result: 'Wheel speed sensor fault', detail: 'Inspect the sensor and tone ring at the indicated wheel for debris or damage. Check sensor resistance / scope output.', dtcs: ['P0500'], severity: 'medium' },
      'r-comm': { result: 'ABS module not communicating', detail: 'Lost-communication: check ABS fuse, main ground, and CAN bus continuity to the module.', dtcs: ['U0121'], severity: 'high' },
      'r-module': { result: 'ABS module internal fault', detail: 'Confirm with a second scan after clearing. If the internal code returns under driving, the module is likely at fault.', severity: 'high' },
      'r-generic': { result: 'Perform the generic ABS self-test', detail: 'Clear codes, drive above 10 mph, re-scan. Follow the ABS code definition that returns.', severity: 'medium' },
    },
  },

  // ============================================================ STEERING / SUSPENSION
  {
    id: 'steering-noise', title: 'Noise when turning', system: 'Steering & Suspension', icon: 'gauge',
    summary: 'Click, clunk, pop or groan when turning the wheel or going around a corner.',
    start: 'n1',
    nodes: {
      n1: { q: 'Is the noise a repeating click only during tight turns while moving?', yes: 'r-cv', no: 'n2' },
      n2: { q: 'Does the noise happen when turning the wheel while stationary?', yes: 'n3', no: 'n4' },
      n3: { q: 'Is it a groaning noise that worsens as the wheel reaches the stops?', yes: 'r-ps-pump', no: 'r-strut-mount' },
      n4: { q: 'Is it a single clunk on bumps while turning?', yes: 'r-sway-bar', no: 'r-ball-joint' },
      'r-cv': { result: 'Replace the outer CV joint', detail: 'The characteristic clicking during tight turns is a worn outer CV joint, usually from a split boot. Replace the axle.', severity: 'medium' },
      'r-ps-pump': { result: 'Check power steering fluid and pump', detail: 'Groaning at full lock = low fluid or a failing power steering pump. Check level and condition first.', severity: 'medium' },
      'r-strut-mount': { result: 'Inspect strut bearing / upper mount', detail: 'Popping or binding when turning stationary usually comes from a dry or seized strut bearing / upper mount.', severity: 'low' },
      'r-sway-bar': { result: 'Replace sway-bar end links', detail: 'Worn end-link bushings produce a clunk when the suspension articulates during a bumpy turn.', severity: 'low' },
      'r-ball-joint': { result: 'Inspect ball joints and control arm bushings', detail: 'With the suspension unloaded, check ball joints for free play and bushings for cracks or tears.', severity: 'medium' },
    },
  },
  {
    id: 'highway-vibration', title: 'Vibration at highway speed', system: 'Wheels & Tires', icon: 'gauge',
    summary: 'Shake, shimmy or vibration felt in the steering wheel or seat at highway speed.',
    start: 'n1',
    nodes: {
      n1: { q: 'Is the vibration felt mainly in the steering wheel?', yes: 'n2', no: 'n3' },
      n2: { q: 'Does the vibration appear or worsen when braking?', yes: 'r-rotor', no: 'r-front-balance' },
      n3: { q: 'Is the vibration felt in the seat or floor?', yes: 'r-rear-balance', no: 'n4' },
      n4: { q: 'Did it start after new tires or wheel work?', yes: 'r-balance', no: 'r-driveline' },
      'r-rotor': { result: 'Resurface or replace front rotors', detail: 'Steering-wheel shimmy that gets worse while braking = front rotor thickness variation. Measure and resurface or replace rotors.', severity: 'medium' },
      'r-front-balance': { result: 'Balance / inspect front tires', detail: 'Shimmy at a specific speed is almost always an unbalanced or damaged front tire. Check for cupped tread, broken belt or missing wheel weights.', severity: 'low' },
      'r-rear-balance': { result: 'Balance / inspect rear tires', detail: 'Floor/seat vibration points to the rear axle. Rotate tires front-to-back — if the vibration moves to the front, you have a bad rear tire.', severity: 'low' },
      'r-balance': { result: 'Re-balance and road-force check', detail: 'Vibration after new tires/wheels: re-balance using a Road Force Balancer and verify the hub seats cleanly without rust buildup.', severity: 'low' },
      'r-driveline': { result: 'Inspect driveline / axle', detail: 'Vibration unrelated to tires: inspect axle shafts, driveshaft u-joints and center support bearing. On FWD, check for worn inner CV joints.', severity: 'medium' },
    },
  },

  // ============================================================ HVAC
  {
    id: 'ac-not-cold', title: 'Air conditioning not cold', system: 'HVAC', icon: 'thermometer',
    summary: 'A/C blows warm, or only cold at highway speed and warm at idle.',
    start: 'n1',
    nodes: {
      n1: { q: 'Does the compressor clutch engage when A/C is requested?', help: 'Watch for the clutch pulling in at the front of the compressor.', yes: 'n2', no: 'n3' },
      n2: { q: 'Are low- and high-side pressures within spec at idle, A/C MAX, blower on high?', spec: 'R-1234yf / R-134a typical: Low ~25–45 psi, High ~200–250 psi at 70–80 °F ambient', yes: 'r-airflow', no: 'n4' },
      n3: { q: 'Does jumpering the clutch coil directly cause the clutch to engage?', yes: 'r-pressure-switch', no: 'r-clutch' },
      n4: { q: 'Are both pressures low (equal) with the compressor off?', yes: 'r-charge', no: 'r-blockage' },
      'r-airflow': { result: 'Check airflow and blend door', detail: 'Pressures normal but no cold air: inspect the cabin filter for restriction and verify the blend door operates (not stuck on heat).', severity: 'low' },
      'r-pressure-switch': { result: 'Low-pressure cutout tripped', detail: 'The clutch coil is OK, but the ECM is cutting the A/C request because the low-pressure switch sees low refrigerant. Recover, evacuate, and check for leaks before recharging.', severity: 'medium' },
      'r-clutch': { result: 'Diagnose clutch coil / wiring', detail: 'Jumping does not engage: measure clutch coil resistance (typical 3–5 Ω) and check the connector/wiring to the ECM relay.', severity: 'medium' },
      'r-charge': { result: 'System undercharged — leak-test and recharge', detail: 'Both sides low = low charge. Evacuate, pressure-test with nitrogen or dye, repair any leak, then evacuate and charge to spec. Never top off a leaking system.', severity: 'medium' },
      'r-blockage': { result: 'Restriction or TXV / orifice fault', detail: 'Low side high + high side low (or vice versa): inspect for a restriction at the expansion valve/orifice tube or a failing compressor.', severity: 'high' },
    },
  },

  // ============================================================ TRANSMISSION
  {
    id: 'trans-hard-shift', title: 'Transmission shifting hard or harshly', system: 'Transmission', icon: 'gauge',
    summary: 'Shifts feel abrupt, slammed, or occur at wrong RPMs.',
    start: 'n1',
    nodes: {
      n1: { q: 'Is the fluid level correct and the fluid clean (not burnt)?', yes: 'n2', no: 'r-fluid' },
      n2: { q: 'Are any TCM codes stored (P07xx, P08xx)?', yes: 'n3', no: 'n4' },
      n3: { q: 'Does the stored code point to a shift solenoid or ratio error?', yes: 'r-solenoid', no: 'r-tcm-code' },
      n4: { q: 'Did the behavior start after a battery disconnect or TCM replacement?', yes: 'r-relearn', no: 'r-mech' },
      'r-fluid': { result: 'Service transmission fluid first', detail: 'Low or burnt ATF causes harsh shifts and can damage clutches further. Correct the level and condition before anything else. Perform a drain-and-fill or exchange per the service schedule.', severity: 'high' },
      'r-solenoid': { result: 'Shift solenoid or ratio code', detail: 'Follow the specific code: measure solenoid resistance, check wiring, and verify input/output speed sensor PIDs during the shift.', dtcs: ['P0730', 'P0740'], severity: 'medium' },
      'r-tcm-code': { result: 'Diagnose per TCM code', detail: 'Query the TCM for sub-codes behind P0700 and follow the specific diagnostic routine.', dtcs: ['P0700'], severity: 'medium' },
      'r-relearn': { result: 'Perform adaptive relearn', detail: 'After a battery disconnect or TCM replacement, the adaptive shift tables are reset. Perform the manufacturer\'s drive-cycle relearn procedure.', severity: 'low' },
      'r-mech': { result: 'Internal transmission concern', detail: 'With good fluid and no codes, consider pressure testing and consult a transmission specialist. Internal clutches or valve-body wear may be the cause.', severity: 'high' },
    },
  },

  // ============================================================ EXHAUST / OIL
  {
    id: 'exhaust-smoke', title: 'Smoke from exhaust', system: 'Engine', icon: 'thermometer',
    summary: 'White, blue or black smoke visible from the tailpipe.',
    start: 'n1',
    nodes: {
      n1: { q: 'What color is the smoke?', yes: 'n-blue', no: 'n2' }, // "Yes" branch arbitrarily taken as "blue"
      n2: { q: 'Is the smoke white and does it persist after warm-up?', yes: 'r-coolant', no: 'n3' },
      n3: { q: 'Is the smoke black with a rich/fuel smell?', yes: 'r-rich', no: 'r-steam' },
      'n-blue': { q: 'Is the smoke blue/grey (oil smell)?', yes: 'r-oil', no: 'r-not-blue' },
      'r-oil': { result: 'Oil is being burned', detail: 'Blue smoke means oil is reaching the combustion chamber. Common causes: worn valve stem seals (puff on cold start), worn rings (constant blue smoke), or a stuck PCV valve.', severity: 'medium' },
      'r-not-blue': { result: 'Re-identify the smoke color', detail: 'Return to step 1 — white smoke means coolant, black means rich fueling.', severity: 'low' },
      'r-coolant': { result: 'Coolant entering combustion chamber', detail: 'Persistent sweet-smelling white smoke after warm-up = coolant in the cylinders. Perform a combustion leak test; suspect head gasket, cracked head or intake manifold gasket.', severity: 'high' },
      'r-rich': { result: 'Rich-mixture fault', detail: 'Black smoke = unburned fuel. Check for stuck-open injectors, high fuel pressure, dirty MAF, failed O2 sensor or stuck-open EVAP purge.', dtcs: ['P0172', 'P0175'], severity: 'medium' },
      'r-steam': { result: 'Normal condensation', detail: 'Light steam that clears quickly on cold start in cold weather is normal exhaust condensation.', severity: 'low' },
    },
  },
  {
    id: 'oil-leak', title: 'Oil leak visible under car', system: 'Engine', icon: 'gauge',
    summary: 'Oil puddle or drips found under the vehicle after parking.',
    start: 'n1',
    nodes: {
      n1: { q: 'Can you confirm the fluid is engine oil (dark amber/black, slick)?', help: 'ATF is red/pink, PS fluid is amber, coolant is green/pink/orange and smells sweet.', yes: 'n2', no: 'r-other-fluid' },
      n2: { q: 'Did a UV dye trace or clean-and-drive isolate the leak location?', yes: 'n3', no: 'r-trace' },
      n3: { q: 'Is the leak at the top of the engine (valve covers, cam seals)?', yes: 'r-top', no: 'n4' },
      n4: { q: 'Is the leak at the oil pan or rear main seal area?', yes: 'r-bottom', no: 'r-side' },
      'r-other-fluid': { result: 'Identify the fluid first', detail: 'Different leaks have different urgency and repairs. Clean the area, drive and re-check to confirm color and location.', severity: 'low' },
      'r-trace': { result: 'Clean, UV-dye, and drive', detail: 'Spray-clean the engine, add UV dye to the oil, drive for a day and re-inspect with a UV light to pinpoint the source.', severity: 'low' },
      'r-top': { result: 'Replace valve cover / cam seal gaskets', detail: 'Top-end oil leaks are usually valve-cover gaskets or cam/VVT solenoid seals. Replace the gasket and clean any oil off ignition coils.', severity: 'low' },
      'r-bottom': { result: 'Oil pan gasket or rear main seal', detail: 'Oil pan gasket: usually straightforward. Rear main seal: labor-intensive (transmission removal typical). Confirm the source before quoting.', severity: 'medium' },
      'r-side': { result: 'Trace to a specific seal', detail: 'Timing cover, oil cooler lines or filter housing gaskets are common side-of-engine sources. Pinpoint with the UV dye trace.', severity: 'medium' },
    },
  },

  // ============================================================ BODY ELECTRICAL
  {
    id: 'window', title: 'Power window inoperative', system: 'Body Electrical', icon: 'window',
    summary: 'Window will not move, moves slowly, or drops into the door.',
    start: 'n1',
    nodes: {
      n1: { q: 'Do the other windows work from the master switch?', yes: 'n2', no: 'r-power' },
      n2: { q: 'Can you hear the motor run when the switch is pressed?', yes: 'r-regulator', no: 'n3' },
      n3: { q: 'Is battery voltage present at the motor connector when UP/DN is pressed?', spec: '≥ 11 V', yes: 'r-motor', no: 'r-switch' },
      'r-power': { result: 'Check window fuse & master switch power', detail: 'All windows inoperative — check the PWR WDO fuse, master switch power/ground and lockout.', severity: 'low' },
      'r-regulator': { result: 'Replace window regulator', detail: 'Motor runs but glass does not move — broken regulator cable or stripped drive.', procedures: ['window-regulator-front'], dtcs: ['B1325'], severity: 'low' },
      'r-motor': { result: 'Replace window motor', detail: 'Motor receives voltage but does not run.', procedures: ['window-regulator-front'], severity: 'low' },
      'r-switch': { result: 'Diagnose switch & wiring', detail: 'No voltage at motor. Test the switch and check the door hinge harness for broken wires.', severity: 'low' },
    },
  },
]

export const SYMPTOM_INDEX = Object.fromEntries(SYMPTOMS.map((s) => [s.id, s]))
