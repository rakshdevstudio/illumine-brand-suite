export const CONTACT_ENQUIRY_TYPES = [
  "General enquiry",
  "School onboarding",
  "Bulk order support",
  "Size and fit help",
  "Order support",
  "Retail partnership",
] as const;

// Hero image generation prompt requested for the contact experience:
// "Generate a high-quality realistic image of Indian school children wearing clean and well-fitted school uniforms, smiling and standing together in a bright school environment. The mood should be warm, welcoming, and trustworthy. Natural lighting, modern look, not overly staged, premium feel."
export const CONTACT_DETAILS = {
  phoneDisplay: "+91 98765 43210",
  phoneHref: "tel:+919876543210",
  whatsappHref:
    "https://wa.me/919876543210?text=Hi%20Illume%2C%20I%27d%20like%20help%20with%20school%20uniforms.",
  email: "hello@illume.co.in",
  addressLines: [
    "273, Basement Floor, KRISHNA PLAZA",
    "5th A Cross St, 8 Block, Income Tax Layout",
    "Naagarabhaavi, 2nd stage Bengaluru, Karnataka 560072",
  ],
  timing: "Mon- Sat: 10:00 AM - 18:00 PM",
  responsePromise: "We usually reply within 24 hours.",
  mapEmbedUrl:
    "https://www.google.com/maps?q=273%20Basement%20Floor%20KRISHNA%20PLAZA%205th%20A%20Cross%20St%208%20Block%20Income%20Tax%20Layout%20Naagarabhaavi%202nd%20stage%20Bengaluru%20Karnataka%20560072&z=15&output=embed",
  heroImageUrl: "/uniforms_image.png",
} as const;
