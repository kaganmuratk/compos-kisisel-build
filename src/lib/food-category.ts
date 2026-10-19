export const foodCategoryLabelsEn: Record<string, string> = {
  Kuruyemiş: 'Nuts', 'Kuru Meyveler': 'Dried Fruits', Atıştırmalık: 'Snacks', Meyveler: 'Fruits', Sebzeler: 'Vegetables',
  Tahıllar: 'Grains', Baklagiller: 'Legumes', 'Yağlar & Soslar': 'Oils & Sauces', 'Sporcu Gıdaları': 'Sports Nutrition',
  'Pilav & Makarna': 'Rice & Pasta', Çorbalar: 'Soups', 'Ana Yemekler': 'Main Dishes', 'Et & Kebap': 'Meat & Kebab',
  'Balık & Deniz': 'Fish & Seafood', 'Zeytinyağlılar & Dolmalar': 'Olive Oil Dishes & Stuffed Vegetables',
  'Hamur Yemekleri': 'Pastry Dishes', Kahvaltı: 'Breakfast', 'Pide & Lahmacun': 'Pide & Lahmacun',
  'Hamur İşleri': 'Baked Pastries', Ekmekler: 'Breads', Şarküteri: 'Deli & Cold Cuts', 'Süt & Yoğurt': 'Milk & Yogurt',
  'Salata & Meze': 'Salads & Appetizers', 'Fast Food': 'Fast Food', 'Sokak Lezzetleri': 'Street Food',
  Tatlılar: 'Desserts', İçecekler: 'Beverages', 'Alkollü İçecekler': 'Alcoholic Beverages', 'Dünya Mutfağı': 'World Cuisine',
  'Sebze ve sebze ürünleri': 'Vegetables & Vegetable Products', 'Et ve et ürünleri': 'Meat & Meat Products',
  'Meyve ve meyve ürünleri': 'Fruit & Fruit Products', 'Balık ve su ürünleri': 'Fish & Seafood Products',
  'Geleneksel gıdalar': 'Traditional Foods', 'Tahıl ve tahıl ürünleri': 'Grains & Grain Products',
  'Yağlı tohumlar ve kuru baklagiller': 'Oilseeds & Dried Legumes', 'Süt ve süt ürünleri': 'Milk & Dairy Products',
  'Muhtelif gıda': 'Miscellaneous Foods', 'Şeker ve şekerli ürünler': 'Sugar & Sugary Products',
  'Özel beslenme amaçlı gıdalar': 'Special Dietary Foods', 'Sıvı ve katı yağlar': 'Liquid & Solid Fats',
  'Yumurta ve yumurta ürünleri': 'Eggs & Egg Products', 'Paketli Ürünler': 'Packaged Products', 'Dondurulmuş Ürünler': 'Frozen Products',
};

export function getFoodCategoryLabel(category: string, language: 'en' | 'tr' = 'tr') {
  return language === 'en' ? foodCategoryLabelsEn[category] ?? category : category;
}
