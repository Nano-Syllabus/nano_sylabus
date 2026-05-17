-- Normalize legacy student profile values so onboarding completeness behaves consistently.

-- 1) Trim whitespace first.
update public.student_profiles
set
  board = trim(board),
  grade = trim(grade)
where board <> trim(board)
   or grade <> trim(grade);

-- 2) Canonicalize board names.
update public.student_profiles
set board = case
  when lower(board) in ('neb', 'n.e.b', 'national examination board') then 'NEB'
  when lower(board) in ('tu', 'tribhuvan university') then 'TU'
  when lower(board) in ('pu', 'pokhara university') then 'PU'
  when lower(board) in ('ku', 'kathmandu university') then 'KU'
  when lower(board) in ('ctevt') then 'CTEVT'
  else board
end
where board <> '';

-- 3) Canonicalize common grade formats to "Class X".
update public.student_profiles
set grade = case
  when lower(replace(grade, ' ', '')) in ('9', 'class9', 'grade9', 'ix', 'classix', 'gradeix') then 'Class 9'
  when lower(replace(grade, ' ', '')) in ('10', 'class10', 'grade10', 'x', 'classx', 'gradex') then 'Class 10'
  when lower(replace(grade, ' ', '')) in ('11', 'class11', 'grade11', 'xi', 'classxi', 'gradexi') then 'Class 11'
  when lower(replace(grade, ' ', '')) in ('12', 'class12', 'grade12', 'xii', 'classxii', 'gradexii') then 'Class 12'
  else grade
end;

-- 4) Safe board backfill for obvious school-level profiles only.
update public.student_profiles
set board = 'NEB'
where board = ''
  and grade in ('Class 9', 'Class 10', 'Class 11', 'Class 12');
