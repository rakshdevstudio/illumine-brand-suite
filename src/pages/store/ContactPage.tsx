import { ContactHero, ContactMainSection, ContactMapSection } from "@/components/store/ContactExperience";

const ContactPage = () => {
  return (
    <div className="bg-white text-foreground">
      <ContactHero />
      <ContactMainSection />
      <ContactMapSection />
    </div>
  );
};

export default ContactPage;
