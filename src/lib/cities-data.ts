// Popular cities for autocomplete
export const CITIES = [
  "New York, USA", "Los Angeles, USA", "Chicago, USA", "Houston, USA", "Phoenix, USA",
  "Philadelphia, USA", "San Antonio, USA", "San Diego, USA", "Dallas, USA", "San Jose, USA",
  "Austin, USA", "Jacksonville, USA", "San Francisco, USA", "Seattle, USA", "Denver, USA",
  "Nashville, USA", "Portland, USA", "Las Vegas, USA", "Miami, USA", "Atlanta, USA",
  "Boston, USA", "Detroit, USA", "Minneapolis, USA", "Charlotte, USA", "Orlando, USA",
  "Toronto, Canada", "Vancouver, Canada", "Montreal, Canada", "Calgary, Canada", "Ottawa, Canada",
  "London, UK", "Manchester, UK", "Birmingham, UK", "Liverpool, UK", "Edinburgh, UK",
  "Glasgow, UK", "Bristol, UK", "Leeds, UK",
  "Paris, France", "Lyon, France", "Marseille, France",
  "Berlin, Germany", "Munich, Germany", "Hamburg, Germany", "Frankfurt, Germany", "Cologne, Germany",
  "Madrid, Spain", "Barcelona, Spain", "Valencia, Spain", "Seville, Spain",
  "Rome, Italy", "Milan, Italy", "Naples, Italy", "Turin, Italy",
  "Amsterdam, Netherlands", "Rotterdam, Netherlands",
  "Brussels, Belgium", "Antwerp, Belgium",
  "Zurich, Switzerland", "Geneva, Switzerland",
  "Vienna, Austria", "Stockholm, Sweden", "Oslo, Norway", "Copenhagen, Denmark", "Helsinki, Finland",
  "Dublin, Ireland", "Lisbon, Portugal", "Warsaw, Poland", "Prague, Czech Republic",
  "Budapest, Hungary", "Bucharest, Romania", "Athens, Greece",
  "Istanbul, Turkey", "Ankara, Turkey",
  "Tokyo, Japan", "Osaka, Japan", "Kyoto, Japan",
  "Seoul, South Korea", "Busan, South Korea",
  "Beijing, China", "Shanghai, China", "Shenzhen, China", "Hong Kong, China",
  "Taipei, Taiwan",
  "Singapore, Singapore",
  "Bangkok, Thailand", "Kuala Lumpur, Malaysia", "Jakarta, Indonesia",
  "Manila, Philippines", "Ho Chi Minh City, Vietnam", "Hanoi, Vietnam",
  "Mumbai, India", "New Delhi, India", "Bangalore, India", "Hyderabad, India",
  "Dubai, UAE", "Abu Dhabi, UAE",
  "Riyadh, Saudi Arabia", "Jeddah, Saudi Arabia",
  "Tel Aviv, Israel", "Jerusalem, Israel",
  "Cairo, Egypt", "Lagos, Nigeria", "Nairobi, Kenya", "Cape Town, South Africa",
  "Johannesburg, South Africa", "Casablanca, Morocco",
  "São Paulo, Brazil", "Rio de Janeiro, Brazil",
  "Buenos Aires, Argentina", "Santiago, Chile", "Lima, Peru",
  "Mexico City, Mexico", "Guadalajara, Mexico", "Bogotá, Colombia", "Medellín, Colombia",
  "Sydney, Australia", "Melbourne, Australia", "Brisbane, Australia", "Perth, Australia",
  "Auckland, New Zealand", "Wellington, New Zealand",
];

export function searchCities(query: string): string[] {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  return CITIES.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
}
