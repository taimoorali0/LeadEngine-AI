<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        $catalog = [
            'Manufacturing' => [
                'Factory' => ['Manufacturing Factory', 'Industrial Factory'],
                'Manufacturing Plant' => ['Production Plant', 'Industrial Plant'],
                'Paper Manufacturing' => ['Paper Manufacturer', 'Paper Factory', 'Paper Plant', 'Paper Mill'],
                'Pulp Mill' => ['Pulp Factory', 'Pulp Manufacturing Plant'],
                'Tissue Manufacturing' => ['Tissue Manufacturer', 'Tissue Factory', 'Tissue Plant'],
                'Tissue Converting' => ['Tissue Converting Factory', 'Tissue Converting Plant'],
                'Corrugated Packaging' => ['Corrugated Factory', 'Corrugated Packaging Plant'],
                'Packaging Factory' => ['Packaging Manufacturer', 'Packaging Plant'],
                'Textile Mill' => ['Textile Factory', 'Textile Manufacturing Plant'],
                'Food Processing Plant' => ['Food Factory', 'Food Manufacturer'],
                'Plastics Factory' => ['Plastic Manufacturer', 'Plastics Plant'],
                'Pharmaceutical Plant' => ['Pharmaceutical Factory', 'Pharmaceutical Manufacturer'],
                'Chemical Plant' => ['Chemical Factory', 'Chemical Manufacturer'],
                'Cement Plant' => ['Cement Factory', 'Cement Manufacturer'],
                'Steel Mill' => ['Steel Factory', 'Steel Manufacturing Plant'],
                'Automotive Factory' => ['Automotive Manufacturing Plant', 'Vehicle Manufacturer'],
            ],
            'Lodging' => [
                'Hotel' => ['Hotels'],
                'Resort' => ['Resorts'],
                'Motel' => ['Motels'],
                'Guest House' => ['Guest Houses'],
                'Hostel' => ['Hostels'],
                'Serviced Apartment' => ['Serviced Apartments'],
                'Vacation Rental' => ['Holiday Rental'],
            ],
            'Retail' => [
                'Supermarket' => ['Supermarkets'],
                'Grocery Store' => ['Grocery Stores'],
                'Clothing Store' => ['Clothing Stores'],
                'Electronics Store' => ['Electronics Stores'],
                'Furniture Store' => ['Furniture Stores'],
                'Hardware Store' => ['Hardware Stores'],
                'Online Retailer' => ['Online Retailers'],
            ],
            'Finance & Insurance' => [
                'Bank' => ['Banks'],
                'Insurance Company' => ['Insurance Companies'],
                'Insurance Broker' => ['Insurance Brokerage'],
                'Microfinance Institution' => ['Microfinance Company'],
                'Financing Company' => ['Finance Company'],
                'Payment Service' => ['Payment Provider'],
            ],
            'Transportation & Logistics' => [
                'Logistics Company' => ['Freight Company', '3PL'],
                'Freight Forwarder' => ['Freight Forwarding Company'],
                'Trucking Company' => ['Road Freight Company'],
                'Courier Service' => ['Courier Company'],
                'Shipping Company' => ['Shipping Line'],
                'Warehouse' => ['Warehousing Company'],
                'Delivery Service' => ['Last Mile Delivery'],
                'Passenger Transport' => ['Passenger Transport Company'],
            ],
            'Construction' => [
                'Construction Company' => ['General Contractor', 'Construction Contractor'],
                'Civil Contractor' => ['Civil Engineering Company'],
                'Builder' => ['Building Contractor'],
                'MEP Contractor' => ['Mechanical Electrical Plumbing Contractor'],
                'Road Contractor' => ['Road Construction Company'],
                'Renovation Company' => ['Renovation Contractor'],
                'Infrastructure Contractor' => ['Infrastructure Construction Company'],
            ],
            'Wholesale & Distribution' => [
                'FMCG Distributor' => ['Consumer Goods Distributor'],
                'Industrial Supplier' => ['Industrial Equipment Distributor'],
                'Medical Distributor' => ['Medical Supplies Distributor'],
                'Building Material Wholesaler' => ['Building Materials Distributor'],
                'Electronics Wholesaler' => ['Electronics Distributor'],
                'Importer & Exporter' => ['Import Export Company'],
                'Wholesaler' => ['Wholesale Company'],
                'Distributor' => ['Distribution Company'],
            ],
        ];

        foreach ($catalog as $sector => $types) {
            DB::table('sectors')->insertOrIgnore(['slug' => Str::slug($sector), 'name' => $sector, 'sort_order' => 100, 'is_active' => true]);
            $sectorId = DB::table('sectors')->where('slug', Str::slug($sector))->value('id');
            foreach ($types as $name => $aliases) {
                $existing = DB::table('business_types')->where('slug', Str::slug($name))->first();
                $aliases = array_values(array_unique(array_merge(json_decode($existing->aliases ?? '[]', true) ?? [], $aliases)));
                DB::table('business_types')->updateOrInsert(['slug' => Str::slug($name)], [
                    'sector_id' => $sectorId, 'name' => $name, 'aliases' => json_encode($aliases),
                    'google_types' => $existing->google_types ?? '[]', 'is_active' => $existing->is_active ?? true,
                ]);
            }
        }
    }

    public function down(): void
    {
        // Preserve taxonomy records referenced by existing customer data.
    }
};
