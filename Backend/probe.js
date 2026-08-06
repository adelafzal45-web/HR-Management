const { Client } = require('pg');
(async () => {
  const c = new Client({host:'localhost',port:5432,user:'postgres',password:'admin',database:'HR'});
  await c.connect();
  const q = async (s,p) => (await c.query(s,p)).rows;
  const show = async (label, s, p) => console.log('\n=== '+label+' ===\n' + JSON.stringify(await q(s,p), null, 1));

  await show('form counts by status', `select status, count(*) from appraisal_forms group by status`);
  await show('gd forms', `select form_id, form_name, status from appraisal_forms where form_name ilike '%Graphic%' or form_name ilike '%Design%'`);
  await show('questions', `select count(*) as bank_questions from appraisal_questions`);
  await show('form question links per form', `select f.form_name, count(fq.form_question_id) as links from appraisal_forms f left join appraisal_form_questions fq on fq.form_id=f.form_id group by f.form_name order by f.form_name`);
  await show('reviews', `select r.status, count(*) from performance_reviews r group by r.status`);
  await show('review detail', `select u2.employee_code as reviewee, u1.employee_code as reviewer, r.review_period, r.status, r.total_score_percentage, f.form_name from performance_reviews r join users u1 on u1.user_id=r.reviewer_id join users u2 on u2.user_id=r.reviewee_id join appraisal_forms f on f.form_id=r.form_id order by r.review_date`);
  await show('answers', `select count(*) from performance_review_answers`);
  await show('depts', `select department_id, department_name from departments order by department_name`);
  await show('desigs', `select g.designation_id, g.title, d.department_name from designations g left join departments d on d.department_id=g.department_id order by g.title`);
  await show('form assignments', `select f.form_name, d.department_name, g.title as designation, u.employee_code from appraisal_form_assignments a join appraisal_forms f on f.form_id=a.form_id left join departments d on d.department_id=a.department_id left join designations g on g.designation_id=a.designation_id left join users u on u.user_id=a.user_id`);
  await show('tla members', `select a.assignment_id, ul.employee_code as lead, a.mode, d.department_name, um.employee_code as member from team_lead_assignments a join users ul on ul.user_id=a.team_lead_id left join departments d on d.department_id=a.department_id left join team_lead_assignment_members m on m.assignment_id=a.assignment_id left join users um on um.user_id=m.user_id`);
  await show('roles', `select role_id, role_name from roles`);
  await show('shifts', `select shift_id, shift_name from shifts`);
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
