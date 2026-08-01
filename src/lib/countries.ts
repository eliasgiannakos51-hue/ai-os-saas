// Plain country names for the signup form's Country dropdown — no ISO
// codes/timezone mapping needed since the Home page greeting derives the
// user's timezone directly from the browser (Intl.DateTimeFormat) instead
// of guessing a single timezone per country, which would be wrong for any
// country spanning more than one zone (US, Russia, Brazil, ...).
export const COUNTRIES: string[] = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia",
  "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados",
  "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina",
  "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia",
  "Cameroon", "Canada", "Cape Verde", "Chad", "Chile", "China", "Colombia", "Comoros",
  "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti",
  "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Estonia", "Eswatini",
  "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany",
  "Ghana", "Greece", "Guatemala", "Guinea", "Guyana", "Haiti", "Honduras", "Hungary",
  "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy",
  "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kuwait",
  "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya",
  "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia",
  "Maldives", "Mali", "Malta", "Mauritania", "Mauritius", "Mexico", "Moldova",
  "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia",
  "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria",
  "North Macedonia", "Norway", "Oman", "Pakistan", "Panama", "Papua New Guinea",
  "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania",
  "Russia", "Rwanda", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone",
  "Singapore", "Slovakia", "Slovenia", "Somalia", "South Africa", "South Korea",
  "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland",
  "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Togo", "Trinidad and Tobago",
  "Tunisia", "Turkey", "Turkmenistan", "Uganda", "Ukraine", "United Arab Emirates",
  "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Venezuela", "Vietnam",
  "Yemen", "Zambia", "Zimbabwe",
];
