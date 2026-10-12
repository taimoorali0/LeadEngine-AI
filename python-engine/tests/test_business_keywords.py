"""Regression checks for industry-specific discovery intent."""
import unittest
from app.services.keywords import generate_keywords


class BusinessKeywordTests(unittest.TestCase):
    def test_paper_facilities_keep_manufacturing_intent(self):
        for phrase in ('Paper Manufacturing', 'Paper Manufacturer', 'Paper Manufacturers'):
            keywords = generate_keywords(phrase)
            self.assertEqual(keywords[0], phrase)
            self.assertTrue({'Paper Mill', 'Paper Factory', 'Paper Plant'}.issubset(keywords))
            self.assertFalse(any('Store' in word or 'Agency' in word for word in keywords))
            self.assertEqual(len(keywords), len({word.lower() for word in keywords}))

    def test_factory_and_plant_targets(self):
        self.assertIn('Industrial Factory', generate_keywords('Factory'))
        self.assertIn('Production Plant', generate_keywords('Manufacturing Plant'))

    def test_new_industry_aliases(self):
        for target, alias in [('Guest House', 'Guest Houses'), ('Bank', 'Banks'),
                              ('Freight Forwarder', 'Freight Forwarding Company'),
                              ('Wholesaler', 'Wholesale Company')]:
            self.assertIn(alias, generate_keywords(target))

    def test_existing_custom_and_arabic_searches(self):
        self.assertIn('مصنع ورق', generate_keywords('Paper Manufacturer', ['en', 'ar']))
        self.assertEqual(generate_keywords('Glass Factory')[:2], ['Glass Factory', 'Glass Manufacturer'])
