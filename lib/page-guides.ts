/**
 * The "Cara pakai" box under each page's title (shown by app/(app)/layout.tsx): what the page is for in
 * one plain sentence, then the steps in order. Written for people who are new to computers: everyday
 * words, the exact button names, one action per step.
 */
export type PageGuide = { purpose: string; steps: string[] }

export const PAGE_GUIDES: Record<string, PageGuide> = {
  "/accounts": {
    purpose: "Daftar semua akun pembukuan (kas, bank, piutang, biaya, penjualan…). Akun dipakai saat menjurnal.",
    steps: [
      "Pertama kali: klik Import daftar akun dan pilih file COA dari Excel.",
      "Untuk menambah satu akun: klik Tambah akun, isi nomor 6 digit dan namanya.",
      "Untuk mengubah: klik Ubah di baris akunnya. Nomor akun tidak bisa diganti.",
      "Akun bahan baku (mis. 105101) pilih Terhubung dengan: Inventory, supaya stok ikut tercatat saat menjurnal.",
    ],
  },
  "/report-lines": {
    purpose: "Baris-baris di laporan Neraca (kode NR) dan Laba rugi (kode LR). Setiap akun bisa diarahkan ke satu baris.",
    steps: ["Pertama kali: klik Tambah baris standar.", "Lalu di Daftar akun, isi Baris laporan setiap akun."],
  },
  "/opening-balances": {
    purpose: "Saldo setiap akun pada hari mulai memakai aplikasi, mis. neraca per 31 Oktober.",
    steps: [
      "Isi tanggal saldo awal.",
      "Ketik saldo di kolom Debit (aset) atau Kredit (hutang, modal).",
      "Total debit dan kredit harus sama (tertulis 'seimbang'), lalu klik Simpan saldo awal.",
    ],
  },
  "/bank": {
    purpose: "Catatan uang masuk dan keluar setiap rekening bank, seperti buku tabungan.",
    steps: [
      "Pilih rekening dan bulan di bagian atas.",
      "Catat satu transaksi lewat kotak isian, atau klik Import buku bank untuk file Excel BANK BOOK.",
      "Rekening baru: klik Rekening bank.",
      "Setelah itu, jurnalkan di halaman Jurnal buku bank.",
    ],
  },
  "/bank-journal": {
    purpose: "Mengubah catatan buku bank menjadi jurnal, dengan memilih akun lawan setiap baris.",
    steps: [
      "Pilih rekening dan bulan. Pertama kali, isi Akun bank ini (mis. 101201).",
      "Di setiap baris, pilih Akun lawan (mis. biaya listrik, penjualan).",
      "Banyak baris dengan akun sama: centang barisnya, pilih akun di kotak atas, klik Isi ke … baris.",
      "Kotak kuning 'Stok masuk' berarti bahan baku harus diisi: klik lalu pilih bahan baku, jumlah dan nilainya.",
      "Voucher berlabel hijau Siap: klik Jurnalkan.",
    ],
  },
  "/journals": {
    purpose: "Semua jurnal: dari buku bank, saldo awal, HPP, dan jurnal yang diketik sendiri.",
    steps: [
      "Pilih bulan untuk melihat jurnalnya; klik Lihat untuk rinciannya.",
      "Untuk transaksi tanpa uang bank (penyusutan, koreksi): klik Jurnal baru.",
      "Salah jurnal? Buka jurnalnya lalu klik Batalkan jurnal, kemudian buat lagi.",
    ],
  },
  "/ledger": {
    purpose: "Riwayat satu akun: semua jurnal yang menyentuhnya dan saldonya dari waktu ke waktu.",
    steps: ["Pilih akun.", "Atur bulan dari dan sampai.", "Klik Lihat di sebuah baris untuk membuka jurnalnya."],
  },
  "/trial-balance": {
    purpose: "Saldo semua akun dalam satu tabel, untuk memastikan pembukuan seimbang.",
    steps: ["Pilih bulan.", "Pastikan tertulis hijau 'Seimbang'. Kalau merah, periksa jurnal bulan itu."],
  },
  "/inventory": {
    purpose: "Daftar bahan baku dan jumlah stoknya sekarang.",
    steps: [
      "Tambah bahan baku: klik Tambah bahan baku (atau Import bahan baku dari Excel).",
      "Stok bertambah atau berkurang: klik Stok masuk / keluar, isi jumlahnya, lalu simpan.",
      "Pembelian lewat bank menambah stok otomatis saat dijurnal di Jurnal buku bank.",
      "Klik Riwayat untuk melihat semua pergerakan satu bahan baku.",
    ],
  },
  "/inventory-movements": {
    purpose: "Semua stok masuk dan keluar, siapa yang mencatat dan kapan.",
    steps: ["Pilih bulan.", "Pilih satu bahan baku untuk melihat kartu stoknya dengan saldo berjalan."],
  },
  "/inventory-value": {
    purpose: "Nilai rupiah setiap bahan baku (harga rata-rata) dan kecocokannya dengan pembukuan.",
    steps: [
      "Pilih bulan.",
      "Di tabel bawah, setiap akun persediaan sebaiknya berlabel hijau Cocok.",
      "Kalau tertulis 'HPP bulan ini belum diposting', posting dulu di HPP bulanan.",
    ],
  },
  "/departments": {
    purpose: "Daftar departemen pabrik. Bahan baku boleh dikelompokkan ke satu departemen.",
    steps: ["Klik Tambah departemen, isi kode dan nama.", "Lalu pilih departemen di form bahan baku."],
  },
  "/cogs": {
    purpose: "Menghitung Harga Pokok Penjualan (HPP) sebulan dari bahan baku yang dipakai dan biaya produksi.",
    steps: [
      "Pilih bulan. Pastikan pemakaian bahan baku bulan itu sudah dicatat di Stok bahan baku.",
      "Isi nilai barang yang masih dalam proses dan barang jadi yang belum terjual (0 bila habis).",
      "Periksa angkanya, lalu klik Posting HPP. Lakukan sekali setiap akhir bulan.",
    ],
  },
  "/balance-sheet": {
    purpose: "Neraca: harta (aset), hutang dan modal perusahaan pada akhir bulan.",
    steps: ["Pilih bulan.", "Pastikan tertulis hijau 'Seimbang'.", "Klik nama akun untuk melihat rinciannya di Buku besar."],
  },
  "/profit-loss": {
    purpose: "Laba rugi: penjualan dikurangi HPP dan biaya, untuk bulan ini dan sejak Januari.",
    steps: ["Pilih bulan.", "Kalau ada peringatan kuning HPP belum diposting, posting dulu di HPP bulanan."],
  },
  "/users": {
    purpose: "Daftar orang yang bisa masuk ke aplikasi dan perannya.",
    steps: ["Master atau Developer bisa mengganti peran pengguna di bawahnya."],
  },
  "/logs": {
    purpose: "Catatan setiap perubahan data: siapa, kapan, dan apa yang berubah.",
    steps: ["Data terbaru ada di paling atas."],
  },
  "/test-data": {
    purpose: "Membersihkan data uji (bertanda UJI) tanpa menyentuh data asli. Khusus Developer.",
    steps: ["Klik Periksa data uji.", "Klik Hapus data uji dan setujui konfirmasinya."],
  },
}
