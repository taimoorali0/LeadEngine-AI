<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sectors', function (Blueprint $t) {
            $t->id();
            $t->string('slug')->unique();
            $t->string('name');
            $t->unsignedSmallInteger('sort_order')->default(100);
            $t->boolean('is_active')->default(true);
        });

        Schema::create('business_types', function (Blueprint $t) {
            $t->id();
            $t->foreignId('sector_id')->nullable()->constrained('sectors')->nullOnDelete();
            $t->string('slug')->unique();
            $t->string('name');
            $t->jsonb('aliases')->default('[]');
            $t->jsonb('google_types')->default('[]');
            $t->boolean('is_active')->default(true);
        });

        Schema::create('service_catalog', function (Blueprint $t) {
            $t->id();
            $t->foreignId('sector_id')->nullable()->constrained('sectors')->nullOnDelete();
            $t->string('slug')->unique();
            $t->string('name');
            $t->jsonb('aliases')->default('[]');
            $t->boolean('is_active')->default(true);
        });

        $sectors = [
            'Automotive', 'Beauty & Personal Care', 'Business Services', 'Construction', 'Education', 'Engineering',
            'Entertainment', 'Finance', 'Food & Beverage', 'Government', 'Healthcare', 'Hospitality', 'Industrial',
            'IT & Software', 'Legal', 'Logistics', 'Manufacturing', 'Marketing', 'Professional Services', 'Real Estate',
            'Retail', 'Security', 'Shopping', 'Telecommunications', 'Transportation', 'Travel', 'Utilities', 'Wholesale',
            'Fashion & Apparel', 'Energy & Solar', 'Agriculture',
        ];

        foreach ($sectors as $i => $name) {
            DB::table('sectors')->updateOrInsert(
                ['slug' => Str::slug($name)],
                ['name' => $name, 'sort_order' => ($i + 1) * 10, 'is_active' => true]
            );
        }

        $businessTypes = [
            'Fashion & Apparel' => [
                ['Clothing Brand', ['Fashion Brand', 'Apparel Brand', 'Ready-to-Wear Brand'], ['clothing_store']],
                ['Boutique', ['Fashion Boutique', 'Designer Boutique'], ['clothing_store']],
                ['Women Clothing Store', ["Women's Clothing", 'Ladies Clothing'], ['womens_clothing_store', 'clothing_store']],
                ['Men Clothing Store', ["Men's Clothing", 'Menswear'], ['mens_clothing_store', 'clothing_store']],
                ['Kids Clothing Store', ['Children Clothing', 'Kidswear'], ['childrens_clothing_store', 'clothing_store']],
                ['Sportswear Brand', ['Sports Clothing', 'Athleisure Brand'], ['sporting_goods_store', 'clothing_store']],
                ['Footwear Brand', ['Shoe Brand', 'Footwear Store'], ['shoe_store']],
                ['Bridal Wear', ['Bridal Brand', 'Wedding Dresses'], ['clothing_store']],
                ['Textile Manufacturer', ['Garment Factory', 'Textile Mill'], []],
            ],
            'Real Estate' => [
                ['Real Estate Agency', ['Property Dealer', 'Property Consultant', 'Estate Agent', 'Realtor'], ['real_estate_agency']],
                ['Real Estate Developer', ['Property Developer', 'Housing Developer'], []],
                ['Builder', ['Builders', 'Building Developer'], ['general_contractor']],
                ['Property Management Company', ['Property Manager'], ['property_management_company']],
            ],
            'Healthcare' => [
                ['Hospital', ['Medical Center', 'Healthcare Center'], ['hospital']],
                ['Clinic', ['Medical Clinic'], ['medical_clinic']],
                ['Dental Clinic', ['Dentist', 'Dental Center'], ['dentist']],
                ['Diagnostic Lab', ['Medical Laboratory', 'Diagnostics'], ['medical_lab']],
                ['Pharmacy', ['Medical Store'], ['pharmacy']],
                ['Medical Equipment Supplier', ['DME Supplier', 'Healthcare Equipment Supplier'], ['medical_supply_store']],
            ],
            'Marketing' => [
                ['Digital Marketing Agency', ['Marketing Agency', 'Performance Marketing Agency'], ['marketing_agency']],
                ['Advertising Agency', ['Ad Agency', 'Creative Agency'], ['advertising_agency']],
                ['SEO Agency', ['SEO Company'], ['marketing_agency']],
                ['Web Development Company', ['Web Agency', 'Website Development'], ['website_designer']],
            ],
            'IT & Software' => [
                ['Software Company', ['Software House', 'IT Company'], ['software_company']],
                ['Cyber Security Company', ['Cybersecurity Firm'], []],
                ['Managed IT Services', ['IT Support Company', 'MSP'], []],
            ],
            'Construction' => [
                ['Construction Company', ['Contractor', 'General Contractor', 'Builders'], ['general_contractor']],
                ['Civil Engineering Company', ['Civil Contractor'], []],
                ['MEP Contractor', ['Mechanical Electrical Plumbing Contractor'], []],
                ['Interior Design Company', ['Interior Designer'], ['interior_designer']],
            ],
            'Industrial' => [
                ['Industrial Automation Company', ['PLC Company', 'SCADA Integrator', 'Automation Integrator'], []],
                ['Industrial Maintenance Company', ['Plant Maintenance', 'Shutdown Contractor'], []],
                ['Fabrication Company', ['Metal Fabricator', 'Steel Fabricator'], []],
                ['HVAC Contractor', ['HVAC Company'], ['hvac_contractor']],
                ['Pump Supplier', ['Industrial Pump Supplier'], []],
            ],
            'Energy & Solar' => [
                ['Solar Company', ['Solar Installer', 'Solar EPC', 'Solar Energy Company'], ['solar_energy_company']],
                ['Electrical Contractor', ['Electrical Company'], ['electrician']],
            ],
            'Food & Beverage' => [
                ['Restaurant', ['Food Restaurant'], ['restaurant']],
                ['Cafe', ['Coffee Shop'], ['cafe']],
                ['Bakery', ['Bakeshop'], ['bakery']],
                ['Food Manufacturer', ['Food Factory', 'Food Processing Company'], []],
            ],
            'Education' => [
                ['School', ['Private School'], ['school']],
                ['College', ['Private College'], ['college']],
                ['University', ['Higher Education Institute'], ['university']],
                ['Training Institute', ['Academy', 'Training Center'], []],
            ],
            'Automotive' => [
                ['Car Dealer', ['Auto Dealer', 'Vehicle Dealer'], ['car_dealer']],
                ['Auto Workshop', ['Car Repair', 'Auto Repair'], ['auto_repair_shop']],
                ['Auto Parts Store', ['Car Parts Supplier'], ['auto_parts_store']],
            ],
            'Hospitality' => [
                ['Hotel', ['Resort', 'Accommodation'], ['hotel']],
                ['Event Venue', ['Banquet Hall', 'Wedding Venue'], ['event_venue']],
            ],
            'Legal' => [
                ['Law Firm', ['Legal Firm', 'Lawyers'], ['lawyer']],
            ],
            'Finance' => [
                ['Accounting Firm', ['Accountants', 'Bookkeeping Firm'], ['accounting']],
                ['Insurance Agency', ['Insurance Broker'], ['insurance_agency']],
            ],
            'Logistics' => [
                ['Logistics Company', ['Freight Company', '3PL'], []],
                ['Courier Service', ['Delivery Service'], ['courier_service']],
                ['Warehouse', ['Warehousing Company'], ['warehouse']],
            ],
            'Security' => [
                ['Security Company', ['Security Services', 'Guarding Company'], []],
                ['CCTV Installer', ['Surveillance Company'], []],
            ],
        ];

        foreach ($businessTypes as $sectorName => $types) {
            $sectorId = DB::table('sectors')->where('name', $sectorName)->value('id');
            foreach ($types as [$name, $aliases, $googleTypes]) {
                DB::table('business_types')->updateOrInsert(
                    ['slug' => Str::slug($name)],
                    ['sector_id' => $sectorId, 'name' => $name, 'aliases' => json_encode($aliases), 'google_types' => json_encode($googleTypes), 'is_active' => true]
                );
            }
        }

        $services = [
            'Marketing' => ['Digital Marketing', 'SEO', 'Social Media Marketing', 'Performance Marketing', 'Branding', 'Advertising', 'Creative Services', 'Lead Generation', 'Content Marketing', 'Email Marketing', 'PR'],
            'IT & Software' => ['Web Development', 'Mobile App Development', 'Software Development', 'Cloud Services', 'Cyber Security', 'IT Support', 'Networking', 'ERP Implementation', 'CRM Implementation'],
            'Industrial' => ['Automation', 'PLC Programming', 'SCADA', 'Electrical Services', 'Mechanical Services', 'Instrumentation', 'Fabrication', 'Piping', 'Plant Maintenance', 'Shutdown Services', 'Calibration', 'HVAC', 'Pump Services', 'Machine Installation', 'Engineering Manpower'],
            'Construction' => ['Civil Construction', 'MEP', 'Interior Design', 'Renovation', 'Fit Out', 'Architecture', 'Structural Engineering', 'Project Management'],
            'Real Estate' => ['Property Sales', 'Property Leasing', 'Property Management', 'Real Estate Development', 'Commercial Real Estate', 'Residential Real Estate'],
            'Healthcare' => ['Hospital Services', 'Dental Care', 'Diagnostics', 'Pharmacy', 'Medical Equipment', 'DME', 'Home Healthcare', 'Physiotherapy'],
            'Fashion & Apparel' => ['Ready-to-Wear', 'Formal Wear', 'Bridal Wear', 'Sportswear', 'Kidswear', 'Footwear', 'Accessories', 'Textile Manufacturing', 'Garment Manufacturing'],
            'Logistics' => ['Freight Forwarding', 'Courier', 'Warehousing', 'Last Mile Delivery', 'Customs Clearance', 'Transportation'],
            'Energy & Solar' => ['Solar EPC', 'Solar Installation', 'Electrical Contracting', 'Energy Audit', 'Solar Maintenance'],
            'Education' => ['School Education', 'Higher Education', 'Professional Training', 'Online Learning', 'Language Training'],
            'Food & Beverage' => ['Restaurant', 'Catering', 'Food Manufacturing', 'Bakery', 'Cafe', 'Food Distribution'],
            'Automotive' => ['Vehicle Sales', 'Auto Repair', 'Auto Parts', 'Car Detailing', 'Fleet Services'],
            'Security' => ['Guarding', 'CCTV', 'Access Control', 'Alarm Systems', 'Fire Safety'],
            'Legal' => ['Corporate Law', 'Litigation', 'Tax Law', 'Intellectual Property', 'Legal Consulting'],
            'Finance' => ['Accounting', 'Audit', 'Bookkeeping', 'Tax Consulting', 'Insurance', 'Financial Advisory'],
        ];
        foreach ($services as $sectorName => $names) {
            $sectorId = DB::table('sectors')->where('name', $sectorName)->value('id');
            foreach ($names as $name) {
                DB::table('service_catalog')->updateOrInsert(
                    ['slug' => Str::slug($sectorName.'-'.$name)],
                    ['sector_id' => $sectorId, 'name' => $name, 'aliases' => '[]', 'is_active' => true]
                );
            }
        }

        $this->seedLocations();
    }

    private function seedLocations(): void
    {
        $country = function (string $code, string $name, ?string $ar = null): int {
            $id = DB::table('locations')->whereNull('parent_id')->where('level', 'country')->where('iso_code', $code)->value('id');
            if ($id) {
                return (int) $id;
            }

            return (int) DB::table('locations')->insertGetId(['level' => 'country', 'iso_code' => $code, 'name_en' => $name, 'name_ar' => $ar, 'search_priority' => 100]);
        };
        $child = function (int $parent, string $level, string $name, ?float $lat = null, ?float $lng = null, int $radius = 25000) {
            $id = DB::table('locations')->where('parent_id', $parent)->where('level', $level)->where('name_en', $name)->value('id');
            if ($id) {
                return (int) $id;
            }

            return (int) DB::table('locations')->insertGetId(['parent_id' => $parent, 'level' => $level, 'name_en' => $name, 'latitude' => $lat, 'longitude' => $lng, 'radius_m' => $radius, 'search_priority' => 50]);
        };

        $pk = $country('PK', 'Pakistan', 'باكستان');
        $punjab = $child($pk, 'province', 'Punjab');
        $sindh = $child($pk, 'province', 'Sindh');
        $ict = $child($pk, 'province', 'Islamabad Capital Territory');
        $kpk = $child($pk, 'province', 'Khyber Pakhtunkhwa');
        $baloch = $child($pk, 'province', 'Balochistan');

        $cities = [
            [$punjab, 'Lahore', 31.5204, 74.3587], [$punjab, 'Faisalabad', 31.4504, 73.1350], [$punjab, 'Rawalpindi', 33.5651, 73.0169],
            [$punjab, 'Multan', 30.1575, 71.5249], [$punjab, 'Gujranwala', 32.1877, 74.1945], [$punjab, 'Sialkot', 32.4945, 74.5229],
            [$punjab, 'Bahawalpur', 29.3956, 71.6836], [$punjab, 'Sargodha', 32.0836, 72.6711], [$punjab, 'Gujrat', 32.5731, 74.1005],
            [$punjab, 'Sheikhupura', 31.7167, 73.9850], [$punjab, 'Jhelum', 32.9405, 73.7276], [$punjab, 'Rahim Yar Khan', 28.4212, 70.2989],
            [$sindh, 'Karachi', 24.8607, 67.0011], [$sindh, 'Hyderabad', 25.3960, 68.3578], [$sindh, 'Sukkur', 27.7244, 68.8228],
            [$ict, 'Islamabad', 33.6844, 73.0479], [$kpk, 'Peshawar', 34.0151, 71.5249], [$kpk, 'Abbottabad', 34.1688, 73.2215],
            [$kpk, 'Mardan', 34.1989, 72.0401], [$baloch, 'Quetta', 30.1798, 66.9750],
        ];
        $cityIds = [];
        foreach ($cities as [$p,$n,$lat,$lng]) {
            $cityIds[$n] = $child($p, 'city', $n, $lat, $lng, 30000);
        }

        $lahoreAreas = [
            ['DHA', 31.4805, 74.3963], ['Gulberg', 31.5204, 74.3487], ['Johar Town', 31.4697, 74.2728], ['Bahria Town', 31.3692, 74.1840],
            ['Model Town', 31.4834, 74.3235], ['Wapda Town', 31.4326, 74.2740], ['Garden Town', 31.5013, 74.3215], ['Faisal Town', 31.4808, 74.3035],
            ['Township', 31.4489, 74.3067], ['Valencia', 31.4018, 74.2586], ['Lake City', 31.3587, 74.2359], ['Cantt', 31.5298, 74.3931],
            ['Askari', 31.5150, 74.4200], ['Allama Iqbal Town', 31.5111, 74.2900], ['Gulshan Ravi', 31.5440, 74.2830], ['Samanabad', 31.5380, 74.3070],
            ['Shadman', 31.5406, 74.3275], ['Liberty Market', 31.5104, 74.3441], ['MM Alam Road', 31.5165, 74.3520], ['Mall Road', 31.5580, 74.3250],
            ['Anarkali', 31.5700, 74.3100], ['Ichhra', 31.5310, 74.3160], ['Mozang', 31.5550, 74.3150], ['Thokar Niaz Baig', 31.4660, 74.2380],
            ['Raiwind Road', 31.3840, 74.2350], ['Canal Road', 31.4930, 74.2660], ['Multan Road', 31.5000, 74.2570], ['Ferozepur Road', 31.4750, 74.3420],
            ['Kot Lakhpat', 31.4642, 74.3197], ['Sundar Industrial Estate', 31.3160, 74.1760], ['Quaid-e-Azam Industrial Estate', 31.4540, 74.3260],
            ['Shahdara', 31.6230, 74.3010], ['Harbanspura', 31.5740, 74.4260], ['Barki Road', 31.5510, 74.4610], ['Bedian Road', 31.4750, 74.4680],
        ];
        foreach ($lahoreAreas as [$n,$lat,$lng]) {
            $child($cityIds['Lahore'], 'area', $n, $lat, $lng, 4500);
        }

        // International countries are available immediately; more cities can be managed in platform taxonomy without code changes.
        foreach ([
            ['SA', 'Saudi Arabia'], ['AE', 'United Arab Emirates'], ['QA', 'Qatar'], ['OM', 'Oman'], ['BH', 'Bahrain'], ['KW', 'Kuwait'],
            ['US', 'United States'], ['GB', 'United Kingdom'], ['CA', 'Canada'], ['AU', 'Australia'], ['TR', 'Turkey'], ['MY', 'Malaysia'],
            ['SG', 'Singapore'], ['DE', 'Germany'], ['FR', 'France'], ['IT', 'Italy'], ['ES', 'Spain'], ['ZA', 'South Africa'], ['EG', 'Egypt'],
            ['IN', 'India'], ['BD', 'Bangladesh'], ['LK', 'Sri Lanka'], ['ID', 'Indonesia'], ['NL', 'Netherlands'],
        ] as [$code,$name]) {
            $country($code, $name);
        }

        $sa = (int) DB::table('locations')->whereNull('parent_id')->where('iso_code', 'SA')->value('id');
        foreach ([['Riyadh', 24.7136, 46.6753], ['Jeddah', 21.4858, 39.1925], ['Dammam', 26.4207, 50.0888], ['Khobar', 26.2172, 50.1971], ['Makkah', 21.3891, 39.8579], ['Madinah', 24.5247, 39.5692]] as [$n,$lat,$lng]) {
            $child($sa, 'city', $n, $lat, $lng, 35000);
        }
        $ae = (int) DB::table('locations')->whereNull('parent_id')->where('iso_code', 'AE')->value('id');
        foreach ([['Dubai', 25.2048, 55.2708], ['Abu Dhabi', 24.4539, 54.3773], ['Sharjah', 25.3463, 55.4209], ['Ajman', 25.4052, 55.5136]] as [$n,$lat,$lng]) {
            $child($ae, 'city', $n, $lat, $lng, 30000);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('service_catalog');
        Schema::dropIfExists('business_types');
        Schema::dropIfExists('sectors');
    }
};
