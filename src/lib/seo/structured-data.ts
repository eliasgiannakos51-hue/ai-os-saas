import type { SeoFacts } from "./facts";

/**
 * JSON-LD, BUILT rather than written by the model.
 *
 * The facts are the AI's — its business name, its address, its FAQ
 * answers, read back off the page it wrote (see facts.ts). The SHAPE is
 * this file's, for three reasons that are all failures we would
 * otherwise ship:
 *
 *  1. INVALID SCHEMA IS WORSE THAN NONE. A model hand-writing JSON-LD
 *     produces a plausible object with the wrong @type, a missing
 *     required property, or a price as a string with a currency symbol
 *     in it. Google's answer to that is to ignore the block — silently.
 *  2. A </script> IN A BUSINESS NAME IS AN XSS ON A PUBLIC PAGE. This is
 *     the one place in the app where model-written text goes inside a
 *     <script> element served to strangers. serialise() below escapes
 *     every "<", which makes the breakout impossible rather than
 *     unlikely.
 *  3. THE PROMPT ALREADY FORBIDS <script>. Asking for one exception
 *     invites the model to reason about which scripts are allowed.
 *
 * WHAT IS DELIBERATELY NOT EMITTED. A type whose required fields are not
 * on the page. A LocalBusiness without a name and a way to reach it is a
 * claim we cannot support, and structured data that describes something
 * the page does not show is precisely what a manual action is for.
 *
 * LOCAL FIRST, on purpose. AI Overviews have taken most of the clicks
 * that informational pages used to get; "bakery near me" still sends a
 * person to a door. So LocalBusiness gets the care here — the same NAP
 * on every page (see nap.ts), opening hours in the machine-readable
 * form, geo when the page states it.
 */

export type JsonLdNode = Record<string, unknown>;

/**
 * schema.org LocalBusiness subtypes worth naming. A declared type that
 * is not one of these falls back to LocalBusiness rather than being
 * passed through: "Coffee Shop" is not a type, "CafeOrCoffeeShop" is,
 * and an invented @type makes the whole node unparseable.
 */
const LOCAL_BUSINESS_TYPES = new Set([
  "LocalBusiness",
  "Restaurant",
  "CafeOrCoffeeShop",
  "Bakery",
  "BarOrPub",
  "FastFoodRestaurant",
  "IceCreamShop",
  "Winery",
  "Store",
  "ClothingStore",
  "GroceryStore",
  "HardwareStore",
  "JewelryStore",
  "PetStore",
  "ShoeStore",
  "SportingGoodsStore",
  "BookStore",
  "FurnitureStore",
  "HealthAndBeautyBusiness",
  "BeautySalon",
  "HairSalon",
  "DaySpa",
  "NailSalon",
  "MedicalBusiness",
  "Dentist",
  "Physician",
  "Optician",
  "Pharmacy",
  "VeterinaryCare",
  "ProfessionalService",
  "Attorney",
  "AccountingService",
  "RealEstateAgent",
  "InsuranceAgency",
  "HomeAndConstructionBusiness",
  "Electrician",
  "Plumber",
  "GeneralContractor",
  "HousePainter",
  "Locksmith",
  "MovingCompany",
  "RoofingContractor",
  "AutomotiveBusiness",
  "AutoRepair",
  "AutoDealer",
  "GasStation",
  "LodgingBusiness",
  "Hotel",
  "BedAndBreakfast",
  "Campground",
  "Hostel",
  "Resort",
  "SportsActivityLocation",
  "GymOrFitnessCenter",
  "YogaStudio",
  "EntertainmentBusiness",
  "NightClub",
  "MovieTheater",
  "ChildCare",
  "School",
  "TravelAgency",
  "Florist",
  "Notary",
  "EmploymentAgency",
  "FinancialService",
]);

export function normaliseBusinessType(declared: string | null | undefined): string {
  const raw = (declared ?? "").trim();
  if (!raw) return "LocalBusiness";
  // Case-insensitive match, so data-seo-type="restaurant" still lands on
  // the real type rather than falling back.
  for (const known of LOCAL_BUSINESS_TYPES) {
    if (known.toLowerCase() === raw.toLowerCase()) return known;
  }
  return "LocalBusiness";
}

export type StructuredDataContext = {
  /** The page's own canonical URL. Null before publish. */
  url: string | null;
  /** The site's root URL, for @id and for the WebSite node. */
  siteUrl: string | null;
  siteName: string | null;
  /** Absolute URL of the page's lead image, when there is one. */
  imageUrl: string | null;
  /** Where this page sits, for a breadcrumb. Empty on the home page. */
  breadcrumb: { name: string; url: string }[];
  /** The site-wide name/address/phone, so every page agrees. */
  nap: { name: string | null; address: string | null; phone: string | null } | null;
};

/**
 * Every node this page can honestly support, in @graph form.
 *
 * @graph rather than several separate <script> blocks: the nodes
 * reference each other (an Article is partOf a WebSite, a breadcrumb
 * belongs to a page), and separate blocks make that impossible to state.
 */
export function buildStructuredData(facts: SeoFacts, ctx: StructuredDataContext): JsonLdNode[] {
  const graph: JsonLdNode[] = [];

  const business = buildLocalBusiness(facts, ctx);
  if (business) graph.push(business);

  const faq = buildFaqPage(facts);
  if (faq) graph.push(faq);

  for (const product of buildProducts(facts, ctx)) graph.push(product);

  const article = buildArticle(facts, ctx);
  if (article) graph.push(article);

  const breadcrumb = buildBreadcrumb(ctx);
  if (breadcrumb) graph.push(breadcrumb);

  const website = buildWebSite(ctx);
  if (website) graph.push(website);

  return graph;
}

function buildLocalBusiness(facts: SeoFacts, ctx: StructuredDataContext): JsonLdNode | null {
  const name = ctx.nap?.name ?? facts.businessName;
  const address = ctx.nap?.address ?? facts.address;
  const phone = ctx.nap?.phone ?? facts.phone;
  // A NAME AND A WAY TO REACH IT. Without both, this is not a local
  // business listing — it is an assertion that one exists.
  if (!name) return null;
  if (!address && !phone) return null;

  const node: JsonLdNode = {
    "@type": normaliseBusinessType(facts.businessType),
    name,
  };
  if (ctx.url) node["@id"] = `${ctx.url}#business`;
  if (ctx.url) node.url = ctx.url;
  if (address) {
    node.address = facts.locality
      ? { "@type": "PostalAddress", streetAddress: address, addressLocality: facts.locality }
      : { "@type": "PostalAddress", streetAddress: address };
  }
  if (phone) node.telephone = phone;
  if (facts.email) node.email = facts.email;
  if (facts.openingHours.length > 0) node.openingHours = facts.openingHours;
  if (facts.priceRange) node.priceRange = facts.priceRange;
  if (facts.geo) {
    node.geo = { "@type": "GeoCoordinates", latitude: facts.geo.lat, longitude: facts.geo.lng };
  }
  if (ctx.imageUrl) node.image = ctx.imageUrl;
  if (facts.sameAs.length > 0) node.sameAs = facts.sameAs;
  return node;
}

function buildFaqPage(facts: SeoFacts): JsonLdNode | null {
  if (facts.faqs.length === 0) return null;
  return {
    "@type": "FAQPage",
    mainEntity: facts.faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

function buildProducts(facts: SeoFacts, ctx: StructuredDataContext): JsonLdNode[] {
  return facts.products.map((p) => {
    const node: JsonLdNode = { "@type": "Product", name: p.name };
    if (ctx.imageUrl) node.image = ctx.imageUrl;
    // AN OFFER NEEDS BOTH HALVES. "12" with no currency is not a price,
    // and Google rejects the offer rather than guessing euros.
    if (p.price && p.currency) {
      const offer: JsonLdNode = {
        "@type": "Offer",
        price: p.price.replace(/[^\d.,]/g, "").replace(",", "."),
        priceCurrency: p.currency.toUpperCase(),
      };
      if (ctx.url) offer.url = ctx.url;
      node.offers = offer;
    }
    return node;
  });
}

function buildArticle(facts: SeoFacts, ctx: StructuredDataContext): JsonLdNode | null {
  // An <article> element alone is not an article — generated marketing
  // pages wrap sections in it routinely. A headline AND a stated
  // publication date is the pair that means "this is a piece of writing
  // with a date on it".
  if (!facts.articleBody || !facts.published || !facts.h1) return null;
  const node: JsonLdNode = {
    "@type": "Article",
    headline: facts.h1,
    datePublished: facts.published,
  };
  if (ctx.url) node.mainEntityOfPage = ctx.url;
  if (ctx.imageUrl) node.image = ctx.imageUrl;
  if (ctx.siteName) node.publisher = { "@type": "Organization", name: ctx.siteName };
  return node;
}

function buildBreadcrumb(ctx: StructuredDataContext): JsonLdNode | null {
  if (ctx.breadcrumb.length < 2) return null;
  return {
    "@type": "BreadcrumbList",
    itemListElement: ctx.breadcrumb.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

function buildWebSite(ctx: StructuredDataContext): JsonLdNode | null {
  if (!ctx.siteUrl || !ctx.siteName) return null;
  return { "@type": "WebSite", "@id": `${ctx.siteUrl}#website`, url: ctx.siteUrl, name: ctx.siteName };
}

/**
 * The <script> block, with the one escape that makes it safe.
 *
 * JSON.stringify does not escape "<". A business name of
 * `Bob</script><script>fetch(...)` therefore closes our block and opens
 * theirs, on a page served to the public from our origin. Replacing "<"
 * with its < escape is valid JSON, parses to the identical string,
 * and makes the sequence unwritable. "&" and ">" go with it because the
 * same reasoning applies to any parser that is more lenient than the
 * spec.
 */
export function serialiseJsonLd(graph: JsonLdNode[]): string {
  if (graph.length === 0) return "";
  const payload = graph.length === 1
    ? { "@context": "https://schema.org", ...graph[0] }
    : { "@context": "https://schema.org", "@graph": graph };
  const json = JSON.stringify(payload)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    // U+2028/U+2029 are valid JSON and invalid JavaScript string
    // literals, which is a parse error in any consumer that evals.
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `<script type="application/ld+json">${json}</script>`;
}
