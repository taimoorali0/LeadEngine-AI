INSERT INTO roles (key, name) VALUES
 ('super_admin','Super Admin'),('owner','Company Owner'),('sales_manager','Sales Manager'),
 ('team_leader','Team Leader'),('researcher','Lead Researcher'),('agent','Sales Agent'),
 ('qc','Quality Control'),('viewer','Viewer');

INSERT INTO permissions (key) VALUES
 ('leads.view_all'),('leads.view_assigned'),('leads.update_status'),('leads.assign'),('leads.delete'),
 ('leads.export_all'),('leads.export_team'),('leads.export_assigned'),('notes.create'),('follow_ups.create'),
 ('companies.edit'),('companies.delete'),('campaigns.manage'),('users.manage'),('settings.manage'),
 ('audit_logs.view');

-- Sales agent: assigned leads only (spec §5)
INSERT INTO role_permissions SELECT r.id, p.id FROM roles r, permissions p
 WHERE r.key = 'agent' AND p.key IN ('leads.view_assigned','leads.update_status','notes.create',
                                     'follow_ups.create','leads.export_assigned');
INSERT INTO role_permissions SELECT r.id, p.id FROM roles r, permissions p
 WHERE r.key IN ('owner','super_admin');
INSERT INTO role_permissions SELECT r.id, p.id FROM roles r, permissions p
 WHERE r.key = 'sales_manager' AND p.key NOT IN ('settings.manage','users.manage','leads.export_all');
INSERT INTO role_permissions SELECT r.id, p.id FROM roles r, permissions p
 WHERE r.key = 'team_leader' AND p.key IN ('leads.view_all','leads.update_status','leads.assign','leads.export_team',
                                           'notes.create','follow_ups.create');
INSERT INTO role_permissions SELECT r.id, p.id FROM roles r, permissions p
 WHERE r.key = 'researcher' AND p.key IN ('leads.view_all','campaigns.manage','companies.edit','notes.create');
INSERT INTO role_permissions SELECT r.id, p.id FROM roles r, permissions p
 WHERE r.key = 'qc' AND p.key IN ('leads.view_all','leads.update_status','companies.edit','notes.create');
INSERT INTO role_permissions SELECT r.id, p.id FROM roles r, permissions p
 WHERE r.key = 'viewer' AND p.key IN ('leads.view_all');

WITH pk AS (INSERT INTO locations (level, iso_code, name_en, name_ur) VALUES ('country','PK','Pakistan','پاکستان') RETURNING id),
     pb AS (INSERT INTO locations (parent_id, level, name_en) SELECT id,'province','Punjab' FROM pk RETURNING id),
     lh AS (INSERT INTO locations (parent_id, level, name_en, latitude, longitude, radius_m)
            SELECT id,'city','Lahore',31.5204,74.3587,25000 FROM pb RETURNING id)
INSERT INTO locations (parent_id, level, name_en, latitude, longitude, radius_m)
SELECT lh.id,'area',a.n,a.lat,a.lng,4000 FROM lh, (VALUES
 ('Gulberg',31.5204,74.3487),('Johar Town',31.4697,74.2728),('DHA',31.4805,74.3963),
 ('Kot Lakhpat',31.4642,74.3197),('Sundar Industrial Estate',31.3160,74.1760)) AS a(n,lat,lng);

WITH sa AS (INSERT INTO locations (level, iso_code, name_en, name_ar) VALUES ('country','SA','Saudi Arabia','المملكة العربية السعودية') RETURNING id)
INSERT INTO locations (parent_id, level, name_en, name_ar, latitude, longitude, radius_m)
SELECT sa.id,'city',c.en,c.ar,c.lat,c.lng,30000 FROM sa, (VALUES
 ('Riyadh','الرياض',24.7136,46.6753),('Jeddah','جدة',21.4858,39.1925)) AS c(en,ar,lat,lng);

INSERT INTO industries (slug, name_en, name_ar) VALUES
 ('real-estate','Real Estate Agency','وكالة عقارية'),('paper-manufacturing','Paper Manufacturing','صناعة الورق'),
 ('healthcare','Healthcare','الرعاية الصحية'),('education','Education','التعليم'),('textile','Textile Manufacturing','صناعة النسيج');
INSERT INTO industries (parent_id, slug, name_en)
 SELECT id,'tissue-manufacturing','Tissue Manufacturing' FROM industries WHERE slug='paper-manufacturing';
INSERT INTO industry_aliases (industry_id, alias)
 SELECT i.id, a FROM industries i, unnest(ARRAY['Property Dealer','Property Consultant','Estate Agent',
   'Property Agent','Dealer','Realtor']) a WHERE i.slug='real-estate';

INSERT INTO permissions (key) VALUES ('reports.view'),('automation.manage'),('billing.manage'),('teams.manage');
INSERT INTO role_permissions SELECT r.id, p.id FROM roles r, permissions p
 WHERE r.key IN ('owner','super_admin') AND p.key IN ('reports.view','automation.manage','billing.manage','teams.manage');
INSERT INTO role_permissions SELECT r.id, p.id FROM roles r, permissions p
 WHERE r.key = 'sales_manager' AND p.key IN ('reports.view','automation.manage','teams.manage');
INSERT INTO role_permissions SELECT r.id, p.id FROM roles r, permissions p
 WHERE r.key = 'team_leader' AND p.key = 'reports.view';
