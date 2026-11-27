import { Link, useParams } from 'react-router-dom';
import { formatKes } from '../lib.js';
import { useDocumentTitle, useResource } from '../hooks.js';
import {
  CopyButton, ErrorState, Icon, PageSkeleton, StatusPill,
} from '../components/ui.jsx';

export default function TrainingRoom() {
  const { slug } = useParams();
  const { data, loading, error, reload } = useResource(`/training/room/${slug}`);
  useDocumentTitle(data?.course?.title || 'Training room');

  if (loading && !data) return <PageSkeleton label="Opening your training room" cards={2} />;
  if (error && !data) {
    return (
      <div className="page-body">
        <ErrorState error={error} onRetry={reload} title="This training room is locked" />
        <div className="center mt-3">
          <Link to="/app/training" className="btn btn-primary">Back to the Academy</Link>
        </div>
      </div>
    );
  }
  if (!data) return null;

  const { course, enrollment, room } = data;
  const roomUrl = `${window.location.origin}/app/training/room/${course.slug}`;

  return (
    <div className="page-body">
      <div className="page-head">
        <div>
          <Link to="/app/training" className="link-btn"><Icon name="arrowLeft" size={13} /> Academy</Link>
          <h1 className="page-title mt-1">{course.title}</h1>
          <p>{course.level} · {course.durationWeeks} weeks · {formatKes(course.priceCents)} per term</p>
        </div>
        <StatusPill status={enrollment?.active ? 'active' : enrollment?.status || 'inactive'} />
      </div>

      <div className="training-room-grid">
        <section className="card training-room-main">
          <div className="room-banner">
            <div className="room-banner-icon"><Icon name="book" size={26} /></div>
            <div className="grow">
              <span className="eyebrow">Live training room</span>
              <h2>Sessions run {course.scheduleDays}</h2>
              <p>{course.scheduleTime} · Nairobi time</p>
            </div>
            <span className="pill active">Enrolled</span>
          </div>
          <p className="small muted mt-3">{room.meetingNote}</p>
          <div className="row wrap mt-3">
            <CopyButton text={roomUrl} label="Copy room link" />
            <Link to="/app/training" className="btn btn-ghost btn-sm">All courses</Link>
          </div>
          <div className="mini-note mt-3">
            Keep this page bookmarked. Your access is valid until{' '}
            <strong>{enrollment?.expiresAt ? new Date(enrollment.expiresAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' }) : 'your term ends'}</strong>.
            Renew from the Academy before that date to keep the room open.
          </div>
        </section>

        <aside className="card">
          <h3 className="section-title">Schedule and term</h3>
          <div className="kv mt-2">
            <div><span>Training days</span><strong>{course.scheduleDays}</strong></div>
            <div><span>Time</span><strong>{course.scheduleTime}</strong></div>
            <div><span>Term ends</span><strong>{enrollment?.expiresAt ? new Date(enrollment.expiresAt).toLocaleDateString('en-KE') : '—'}</strong></div>
            <div><span>Level</span><strong>{course.level}</strong></div>
          </div>
          <div className="divider" />
          <h4 className="small strong">Room rules</h4>
          <ul className="rules-list mt-2">
            {room.rules.map((rule) => <li key={rule}><Icon name="check" size={13} />{rule}</li>)}
          </ul>
        </aside>
      </div>

      <section className="card mt-3">
        <div className="card-head">
          <div>
            <h3>Course outline</h3>
            <p>What you will cover this term.</p>
          </div>
        </div>
        <ol className="training-outline">
          {course.curriculum.map((item, index) => (
            <li key={item}>
              <span className="outline-number">{index + 1}</span>
              <div>
                <strong>{item}</strong>
                <span className="tiny muted">Covered in class, with practical exercises and take-home work.</span>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
