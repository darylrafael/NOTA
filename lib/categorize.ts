import { Category } from '../constants/categories';

const CATEGORY_KEYWORDS: Record<Exclude<Category, 'Other'>, string[]> = {
  'Food & Drink': [
    'nasi', 'goreng', 'ayam', 'bakso', 'mie', 'sate', 'soto', 'bubur',
    'kopi', 'teh', 'jus', 'juice', 'boba', 'roti', 'kue', 'cumi', 'cah',
    'kangkung', 'cap jay', 'capjay', 'capcay', 'tahu', 'tempe', 'ikan bakar',
    'udang', 'cafe', 'kafe', 'warung', 'restoran', 'resto', 'makan', 'minum',
    'food', 'drink', 'coffee', 'restaurant', 'burger', 'pizza',
    'croissant', 'pudding', 'brulee', 'bruille', 'chocolat', 'cake', 'es',
    'bebek', 'gado', 'siomay', 'batagor', 'martabak', 'pisang', 'donat',
    'waffle', 'pancake', 'crepe', 'pasta', 'sandwich', 'salad', 'sushi',
    'dim sum', 'kwetiau', 'fuyunghai', 'black pepper', 'mushroom', 'soup',
    'steak', 'grill', 'bbq', 'fried', 'baked', 'steamed', 'gofood', 'grabfood', 'shopeefood'
  ],
  Groceries: [
    'indomaret', 'alfamart', 'superindo', 'hypermart', 'carrefour', 'pasar',
    'sayur', 'buah', 'beras', 'minyak', 'minyak goreng', 'gula', 'telur',
    'susu', 'garam', 'grocery', 'groceries', 'supermarket', 'sabun',
    'shampoo', 'pasta gigi', 'detergen', 'tisu', 'pembalut', 'popok',
    'daging', 'ikan', 'bumbu', 'kecap', 'saos', 'tepung', 'kerupuk',
    'biscuit', 'wafer', 'candy', 'chocolate bar', 'minimarket', 'giant',
    'lottemart', 'belanja'
  ],
  Transport: [
    'gojek', 'grab', 'ojek', 'taksi', 'taxi', 'bensin', 'pertamina', 'shell',
    'parkir', 'tol', 'toll', 'bus', 'kereta', 'krl', 'mrt', 'lrt', 'busway',
    'transport', 'fuel', 'parking', 'pertalite', 'pertamax', 'solar', 'bbm',
    'maxim', 'indriver', 'gocar', 'grabcar', 'tiket kereta', 'tiket pesawat'
  ],
  Health: [
    'apotek', 'obat', 'dokter', 'klinik', 'rumah sakit', 'vitamin',
    'paracetamol', 'ibuprofen', 'amoxicillin', 'kimia farma', 'guardian',
    'pharmacy', 'medicine', 'clinic', 'hospital', 'suplemen', 'masker',
    'hand sanitizer', 'alkohol', 'betadin', 'plester', 'kasa', 'termometer',
    'tensi', 'berobat'
  ],
  Entertainment: [
    'bioskop', 'tiket', 'konser', 'xxi', 'cgv', 'cinepolis',
    'cinema', 'netflix', 'spotify', 'game', 'concert', 'ticket', 'steam',
    'playstation', 'museum', 'taman', 'wahana', 'langganan', 'subscribe', 'nonton'
  ],
  Shopping: [
    'baju', 'sepatu', 'tas', 'elektronik',
    'shopee', 'tokopedia', 'mall', 'uniqlo', 'zara',
    'shirt', 'shoes', 'fashion', 'electronics', 'celana', 'sandal',
    'dompet', 'jam', 'kacamata', 'aksesoris', 'hp', 'laptop', 'charger',
    'kabel', 'earphone', 'kosmetik', 'skincare', 'parfum', 'beli', 'paylater'
  ],
  Bills: [
    'listrik', 'pln', 'pdam', 'pulsa', 'token', 'tagihan', 'wifi', 'indihome',
    'electricity', 'bill', 'internet', 'subscription', 'air', 'pam',
    'telkom', 'firstmedia', 'biznet', 'paket data', 'iuran', 'kos', 'sewa',
    'kontrakan', 'cicilan', 'kredit', 'angsuran', 'bpjs', 'pajak'
  ],
};

export function categorizeItem(itemName: string): Category {
  const normalized = itemName.toLowerCase().trim();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return category as Category;
    }
  }

  return 'Other';
}
