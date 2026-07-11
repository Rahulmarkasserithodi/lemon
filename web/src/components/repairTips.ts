// "Make it last" — for each extracted failure mode, a practical prevention /
// repair tip and a rough repairability level. Reframes a failure from a reason
// to replace into a reason to repair (buy-to-last → keep-it-longer → dispose).

export type Effort = 'DIY' | 'Shop' | 'Pro'

export interface RepairTip {
  tip: string
  effort: Effort
}

// Keyed to config.FAILURE_MODES (appliance + laptop vocab).
export const REPAIR_TIPS: Record<string, RepairTip> = {
  stopped_working: {
    tip: 'Often just a power fault. Check the outlet, plug, and internal fuse before writing it off — a “dead” unit is frequently a cheap reset or fuse away.',
    effort: 'DIY',
  },
  wont_power_on: {
    tip: 'Try a different outlet and cable first; a blown fuse or power board is a common, inexpensive fix.',
    effort: 'Shop',
  },
  wont_boot: {
    tip: 'Hard-reset and reseat the RAM/storage. A failed boot drive is a cheap swap, not a new machine.',
    effort: 'DIY',
  },
  cooling_failure: {
    tip: 'Clean the coils/vents and clear airflow — dust is the #1 cause. Refrigerant faults need a pro.',
    effort: 'Shop',
  },
  heating_failure: {
    tip: 'The heating element is usually a replaceable part — test it for continuity before scrapping the whole appliance.',
    effort: 'Shop',
  },
  motor_failure: {
    tip: 'Clear any obstruction and check the belt/brushes; worn motor brushes are a cheap, common fix.',
    effort: 'Shop',
  },
  leak: {
    tip: 'Inspect hoses, seals, and gaskets — a $10 gasket fixes most leaks.',
    effort: 'DIY',
  },
  physical_breakage: {
    tip: 'Cracked housings, handles, and hinges are usually a replaceable part or an epoxy repair away.',
    effort: 'DIY',
  },
  electrical_fault: {
    tip: 'Unplug it and stop using it. Frayed cords and blown fuses are fixable; get burnt boards checked by a pro.',
    effort: 'Pro',
  },
  control_failure: {
    tip: 'Buttons, displays, and control boards are common replaceable modules — look up the part number before replacing the whole unit.',
    effort: 'Shop',
  },
  noise_vibration: {
    tip: 'Usually a loose mount, worn bearing, or unbalanced load — tighten, rebalance, or swap the bearing.',
    effort: 'DIY',
  },
  rust_corrosion: {
    tip: 'Treat surface rust early and keep it dry; only structural corrosion is hard to reverse.',
    effort: 'DIY',
  },
  battery_failure: {
    tip: 'Batteries are consumable — a replacement is a fraction of a new device and often user- or shop-swappable. Don’t bin the whole thing for a dead cell.',
    effort: 'Shop',
  },
  screen_failure: {
    tip: 'Cracked or dead screens are a standard repair-shop swap — usually far cheaper than replacing the device.',
    effort: 'Shop',
  },
  keyboard_failure: {
    tip: 'Laptop keyboards and trackpads are replaceable parts; an external keyboard is a zero-cost stopgap meanwhile.',
    effort: 'DIY',
  },
  hinge_failure: {
    tip: 'Hinges are a known weak point and a routine repair-shop fix — don’t let a $30 part total the laptop.',
    effort: 'Shop',
  },
  storage_failure: {
    tip: 'Back up, then swap the SSD/HDD — a cheap drive replacement gives the machine a second life.',
    effort: 'DIY',
  },
  overheating: {
    tip: 'Clean the fans/vents and re-paste the CPU. Thermal throttling is almost always dust or dried paste, not a dead machine.',
    effort: 'DIY',
  },
  charging_port_failure: {
    tip: 'Try another cable first; a worn charging port is a common, inexpensive repair-shop fix.',
    effort: 'Shop',
  },
  other: {
    tip: 'Search the exact symptom plus the model number — most failures have a documented, affordable fix.',
    effort: 'DIY',
  },
}

export function repairTip(mode: string): RepairTip | null {
  return REPAIR_TIPS[mode] ?? null
}

/** iFixit repair-guide search for this product (brand + a few title words). */
export function ifixitUrl(brand: string, title: string): string {
  const generic = /^(amazon|amazon renewed|renewed|generic|unbranded|unknown)$/i.test(brand.trim())
  const useBrand = brand && !generic && !title.toLowerCase().includes(brand.toLowerCase())
  const base = useBrand ? `${brand} ${title}` : title
  const q = base.split(/\s+/).slice(0, 5).join(' ')
  return `https://www.ifixit.com/Search?query=${encodeURIComponent(q)}`
}
