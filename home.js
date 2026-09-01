const heroImageEl = document.getElementById("home-hero-image");

if (heroImageEl) {
  const heroImages = [
    "images/banner-hero/verde-menta.png",
    "images/banner-hero/azul-cielo.png",
    "images/banner-hero/vinotinto.png"
  ];

  let currentIndex = 0;

  heroImages.forEach((src) => {
    const img = new Image();
    img.src = src;
  });

  const applyHeroImage = () => {
    heroImageEl.src = heroImages[currentIndex];
  };

  applyHeroImage();

  if (heroImages.length > 1) {
    setInterval(() => {
      currentIndex = (currentIndex + 1) % heroImages.length;
      applyHeroImage();
    }, 5000);
  }
}
