<?php

namespace App\Services;

use RuntimeException;

/** Reads uploaded CSV files: detects , ; or tab, strips a UTF-8 BOM, converts Windows-1252 text. */
class CsvReader
{
    public const MAX_ROWS = 20000;

    /** Columns LeadEngine understands, with header names commonly used by directories and spreadsheets. */
    public const FIELDS = [
        'name' => ['name', 'company', 'company name', 'business', 'business name', 'organization', 'title', 'listing name'],
        'phone' => ['phone', 'phone number', 'telephone', 'tel', 'mobile', 'contact number', 'contact'],
        'email' => ['email', 'e-mail', 'email address', 'mail'],
        'website' => ['website', 'web', 'url', 'site', 'homepage', 'web site'],
        'address' => ['address', 'street', 'full address', 'location', 'street address'],
        'city' => ['city', 'town', 'area', 'district'],
        'category' => ['category', 'categories', 'industry', 'type', 'business type', 'sector'],
        'rating' => ['rating', 'stars', 'score'],
        'reviews' => ['reviews', 'review count', 'reviews count', 'ratings'],
        'linkedin' => ['linkedin', 'linkedin url', 'linkedin page', 'linkedin profile'],
    ];

    /** @return array{headers: list<string>, rows: list<list<string>>} */
    public function read(string $path): array
    {
        $raw = file_get_contents($path);
        if ($raw === false || trim($raw) === '') {
            throw new RuntimeException('The file is empty.');
        }
        $raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw);
        if (! mb_check_encoding($raw, 'UTF-8')) {
            $raw = mb_convert_encoding($raw, 'UTF-8', 'Windows-1252');
        }
        $firstLine = strtok($raw, "\r\n");
        $delimiter = collect([',', ';', "\t"])->sortByDesc(fn ($d) => substr_count($firstLine, $d))->first();

        $fh = fopen('php://temp', 'r+');
        fwrite($fh, $raw);
        rewind($fh);
        $headers = array_map(fn ($h) => trim((string) $h), fgetcsv($fh, null, $delimiter, '"', '') ?: []);
        $rows = [];
        while (($row = fgetcsv($fh, null, $delimiter, '"', '')) !== false) {
            if ($row === [null] || count(array_filter($row, fn ($v) => trim((string) $v) !== '')) === 0) {
                continue;
            }
            if (count($rows) >= self::MAX_ROWS) {
                throw new RuntimeException('Files can have at most '.self::MAX_ROWS.' rows. Split the file and import it in parts.');
            }
            $rows[] = array_map(fn ($v) => trim((string) $v), $row);
        }
        fclose($fh);

        return ['headers' => $headers, 'rows' => $rows];
    }

    /** @return array<string, int> LeadEngine field => column index, guessed from header names */
    public function guessMapping(array $headers): array
    {
        $mapping = [];
        foreach ($headers as $i => $header) {
            $h = mb_strtolower(trim(preg_replace('/[_\-]+/', ' ', $header)));
            foreach (self::FIELDS as $field => $aliases) {
                if (! isset($mapping[$field]) && in_array($h, $aliases, true)) {
                    $mapping[$field] = $i;
                    break;
                }
            }
        }

        return $mapping;
    }
}
