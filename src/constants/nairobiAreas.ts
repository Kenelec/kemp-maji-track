export const NAIROBI_AREAS = [
  // Central Nairobi
  "Central Business District",
  "Upper Hill",
  "Westlands",
  "Hurlingham",
  "Kilimani",
  "Lavington",
  "Parklands",
  "Highridge",
  "Ngara",
  "Kenyatta Avenue",
  "Tom Mboya Street",
  
  // South Nairobi
  "South B",
  "South C",
  "Karen",
  "Langata",
  "Nyayo Estate",
  "Madaraka",
  "Kibera",
  "Mugoya",
  "Nyayo Highrise",
  "Railways",
  "Industrial Area",
  
  // East Nairobi
  "Eastleigh",
  "Airbase",
  "California",
  "Mwiki",
  "Komarock",
  "Donholm",
  "Embakasi",
  "Pipeline",
  "Kariobangi",
  "Dandora",
  "Korogocho",
  "Kayole",
  "Mlolongo",
  "Athi River",
  
  // North Nairobi
  "Ruaka",
  "Ruai",
  "Kahawa",
  "Kahawa West",
  "Zimmerman",
  "Huruma",
  "Mlango Kubwa",
  "Kiambu Road",
  "Thika Road",
  "Githurai",
  "Kawangware",
  "Mountain View",
  
  // West Nairobi
  "Uthiru",
  "Riruta",
  "Gitanga",
  "Karura",
  "Mountain View",
  "Kabiro",
  "Waiyaki Way",
  "Mutu-ini",
  "Rongai",
  "Ngong",
  "Ongata Rongai",
  
  // Other Areas
  "Limuru",
  "Juja",
  "Syokimau",
  "Mavoko",
  "Kiserian",
  "Magadi Road",
  "Airport",
  "Wilson Airport",
  "JKIA",
  "CBD"
] as const;

export type NairobiArea = typeof NAIROBI_AREAS[number];
