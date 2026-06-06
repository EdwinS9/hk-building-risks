-- ===========================================================================
-- Dev seed data. Loads ~50 mock HK blocks with a few per-factor scores.
-- Run with:  supabase db reset  (resets local DB and replays migrations + seed)
-- This file is NOT applied to remote projects automatically.
-- ===========================================================================
set search_path = public, extensions;

insert into public.blocks (object_id, address, district, region, latitude, longitude, risk_score, risk_score_updated_at) values
  ('OBJ-0001', '12 Queen''s Rd Central',          'Central',        'Hong Kong Island', 22.2819, 114.1577, 28, now() - interval '2 days'),
  ('OBJ-0002', 'Jardine House Tower B',           'Central',        'Hong Kong Island', 22.2845, 114.1601, 42, now() - interval '4 days'),
  ('OBJ-0003', '8 Connaught Place',               'Central',        'Hong Kong Island', 22.2830, 114.1612, 19, now() - interval '1 day'),
  ('OBJ-0004', 'Old Bank Building, Des Voeux',    'Central',        'Hong Kong Island', 22.2832, 114.1554, 76, now() - interval '3 days'),
  ('OBJ-0005', 'Pacific Tower, Admiralty',        'Admiralty',      'Hong Kong Island', 22.2790, 114.1656, 33, now() - interval '6 days'),
  ('OBJ-0006', '188 Hennessy Road',               'Wan Chai',       'Hong Kong Island', 22.2776, 114.1755, 58, now() - interval '8 days'),
  ('OBJ-0007', 'Lockhart Tenement Cluster',       'Wan Chai',       'Hong Kong Island', 22.2770, 114.1790, 88, now() - interval '22 days'),
  ('OBJ-0008', 'Spring Garden Lane Block',        'Wan Chai',       'Hong Kong Island', 22.2747, 114.1772, 71, now() - interval '5 days'),
  ('OBJ-0009', 'Times Square Annex',              'Causeway Bay',   'Hong Kong Island', 22.2789, 114.1822, 24, now() - interval '2 days'),
  ('OBJ-0010', '500 Hennessy Mid-rise',           'Causeway Bay',   'Hong Kong Island', 22.2795, 114.1839, 47, now() - interval '11 days'),
  ('OBJ-0011', 'Russell Street Old Block',        'Causeway Bay',   'Hong Kong Island', 22.2802, 114.1827, 81, now() - interval '16 days'),
  ('OBJ-0012', 'Yee Wo Street Walk-ups',          'Causeway Bay',   'Hong Kong Island', 22.2808, 114.1850, 62, now() - interval '9 days'),
  ('OBJ-0013', 'King''s Road 800 Tower',          'North Point',    'Hong Kong Island', 22.2906, 114.2008, 36, now() - interval '4 days'),
  ('OBJ-0014', 'Java Road Walk-up Cluster',       'North Point',    'Hong Kong Island', 22.2917, 114.1968, 73, now() - interval '19 days'),
  ('OBJ-0015', 'Taikoo Place Block 3',            'Quarry Bay',     'Hong Kong Island', 22.2870, 114.2128, 17, now() - interval '3 days'),
  ('OBJ-0016', 'Cityplaza Heights',               'Quarry Bay',     'Hong Kong Island', 22.2851, 114.2156, 31, now() - interval '7 days'),
  ('OBJ-0017', '1 Peking Road',                   'Tsim Sha Tsui',  'Kowloon',          22.2962, 114.1697, 40, now() - interval '2 days'),
  ('OBJ-0018', 'Chungking Mansions Wing C',       'Tsim Sha Tsui',  'Kowloon',          22.2964, 114.1730, 94, now() - interval '3 days'),
  ('OBJ-0019', 'Hankow Road Block 12',            'Tsim Sha Tsui',  'Kowloon',          22.2975, 114.1712, 55, now() - interval '13 days'),
  ('OBJ-0020', 'Nathan Plaza North',              'Tsim Sha Tsui',  'Kowloon',          22.2998, 114.1722, 26, now() - interval '1 day'),
  ('OBJ-0021', 'Argyle Street 88 Block',          'Mong Kok',       'Kowloon',          22.3193, 114.1696, 79, now() - interval '6 days'),
  ('OBJ-0022', 'Sai Yeung Choi Tenement',         'Mong Kok',       'Kowloon',          22.3175, 114.1717, 91, now() - interval '2 days'),
  ('OBJ-0023', 'Mong Kok Road Mid-rise',          'Mong Kok',       'Kowloon',          22.3211, 114.1680, 64, now() - interval '10 days'),
  ('OBJ-0024', 'Fa Yuen Street Block 7',          'Mong Kok',       'Kowloon',          22.3218, 114.1705, 86, now() - interval '25 days'),
  ('OBJ-0025', 'Prince Edward Road West 220',     'Mong Kok',       'Kowloon',          22.3243, 114.1683, 38, now() - interval '5 days'),
  ('OBJ-0026', 'Temple Street Block A',           'Yau Ma Tei',     'Kowloon',          22.3094, 114.1712, 72, now() - interval '7 days'),
  ('OBJ-0027', 'Jordan Road Walk-up',             'Jordan',         'Kowloon',          22.3045, 114.1714, 53, now() - interval '12 days'),
  ('OBJ-0028', 'Nathan Road 380 Tower',           'Yau Ma Tei',     'Kowloon',          22.3079, 114.1721, 22, now() - interval '2 days'),
  ('OBJ-0029', 'Apliu Street Tenement Cluster',   'Sham Shui Po',   'Kowloon',          22.3306, 114.1597, 89, now() - interval '4 days'),
  ('OBJ-0030', 'Pei Ho Street Block 18',          'Sham Shui Po',   'Kowloon',          22.3327, 114.1573, 67, now() - interval '15 days'),
  ('OBJ-0031', 'Cheung Sha Wan Road 600',         'Sham Shui Po',   'Kowloon',          22.3340, 114.1551, 45, now() - interval '8 days'),
  ('OBJ-0032', 'Lai Chi Kok Mid-rise',            'Sham Shui Po',   'Kowloon',          22.3351, 114.1481, 30, now() - interval '3 days'),
  ('OBJ-0033', 'To Kwa Wan Block 22',             'Kowloon City',   'Kowloon',          22.3173, 114.1869, 84, now() - interval '18 days'),
  ('OBJ-0034', 'Ma Tau Wai Walk-ups',             'Kowloon City',   'Kowloon',          22.3196, 114.1842, 77, now() - interval '5 days'),
  ('OBJ-0035', 'Hung Hom Tower B',                'Hung Hom',       'Kowloon',          22.3047, 114.1881, 35, now() - interval '2 days'),
  ('OBJ-0036', 'Whampoa Garden Mid-rise',         'Hung Hom',       'Kowloon',          22.3057, 114.1908, 21, now() - interval '4 days'),
  ('OBJ-0037', 'Telford Plaza Annex',             'Kowloon Bay',    'Kowloon',          22.3230, 114.2126, 41, now() - interval '6 days'),
  ('OBJ-0038', 'Kwun Tong Road 350',              'Kwun Tong',      'Kowloon',          22.3132, 114.2241, 59, now() - interval '11 days'),
  ('OBJ-0039', 'Tsui Ping Estate Block C',        'Kwun Tong',      'Kowloon',          22.3162, 114.2273, 68, now() - interval '9 days'),
  ('OBJ-0040', 'Sha Tin Centre Block 4',          'Sha Tin',        'New Territories',  22.3814, 114.1928, 25, now() - interval '3 days'),
  ('OBJ-0041', 'Fo Tan Industrial Conv.',         'Sha Tin',        'New Territories',  22.3955, 114.1986, 54, now() - interval '14 days'),
  ('OBJ-0042', 'City One Sha Tin Block 22',       'Sha Tin',        'New Territories',  22.3823, 114.2035, 18, now() - interval '1 day'),
  ('OBJ-0043', 'Tai Wai Walk-up Cluster',         'Sha Tin',        'New Territories',  22.3727, 114.1781, 70, now() - interval '20 days'),
  ('OBJ-0044', 'Sai Ying Pun Block 14',           'Western',        'Hong Kong Island', 22.2860, 114.1429, 65, now() - interval '7 days'),
  ('OBJ-0045', 'Kennedy Town Tower D',            'Western',        'Hong Kong Island', 22.2824, 114.1280, 29, now() - interval '2 days'),
  ('OBJ-0046', 'Sheung Wan Old Block',            'Sheung Wan',     'Hong Kong Island', 22.2870, 114.1495, 80, now() - interval '17 days'),
  ('OBJ-0047', 'Aberdeen Centre Block 9',         'Aberdeen',       'Hong Kong Island', 22.2480, 114.1551, 44, now() - interval '5 days'),
  ('OBJ-0048', 'Ap Lei Chau Estate Block 3',      'Aberdeen',       'Hong Kong Island', 22.2422, 114.1547, 32, now() - interval '3 days'),
  ('OBJ-0049', 'Tuen Mun Heung Sze Wui',          'Tuen Mun',       'New Territories',  22.3911, 113.9719, 51, now() - interval '8 days'),
  ('OBJ-0050', 'Yuen Long Town Walk-ups',         'Yuen Long',      'New Territories',  22.4445, 114.0335, 74, now() - interval '21 days');

-- Per-factor breakdowns for a representative subset.
insert into public.scores (block_id, score_name, score_value)
select b.id, s.name, s.value
from public.blocks b
join (values
  ('OBJ-0002', 'Structural age',        0.35),
  ('OBJ-0002', 'Maintenance lag',       0.30),
  ('OBJ-0002', 'Drainage condition',    0.20),
  ('OBJ-0002', 'Facade integrity',      0.15),
  ('OBJ-0004', 'Structural age',        0.40),
  ('OBJ-0004', 'Unauthorized works',    0.30),
  ('OBJ-0004', 'Water seepage',         0.20),
  ('OBJ-0004', 'Facade integrity',      0.10),
  ('OBJ-0007', 'Structural age',        0.45),
  ('OBJ-0007', 'Subdivided units',      0.25),
  ('OBJ-0007', 'Unauthorized works',    0.20),
  ('OBJ-0007', 'Drainage condition',    0.10),
  ('OBJ-0018', 'Subdivided units',      0.35),
  ('OBJ-0018', 'Structural age',        0.30),
  ('OBJ-0018', 'Fire safety',           0.20),
  ('OBJ-0018', 'Unauthorized works',    0.15),
  ('OBJ-0022', 'Structural age',        0.45),
  ('OBJ-0022', 'Unauthorized works',    0.30),
  ('OBJ-0022', 'Subdivided units',      0.15),
  ('OBJ-0022', 'Drainage condition',    0.10),
  ('OBJ-0029', 'Structural age',        0.40),
  ('OBJ-0029', 'Subdivided units',      0.30),
  ('OBJ-0029', 'Fire safety',           0.20),
  ('OBJ-0029', 'Drainage condition',    0.10)
) as s(object_id, name, value) on s.object_id = b.object_id;
