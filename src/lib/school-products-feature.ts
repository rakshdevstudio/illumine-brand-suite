let schoolProductsUnavailable = false;

export const markSchoolProductsUnavailable = () => {
  schoolProductsUnavailable = true;
};

export const isSchoolProductsUnavailable = () => schoolProductsUnavailable;
