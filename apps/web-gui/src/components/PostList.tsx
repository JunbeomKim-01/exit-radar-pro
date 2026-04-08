import { useState } from 'react';
import { format } from 'date-fns';
import { MessageSquare, ExternalLink, User, Quote, ChevronDown, ChevronUp } from 'lucide-react';
import type { PostResponse } from '../api';

export function PostList({ posts }: { posts: PostResponse[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const INITIAL_COUNT = 5;

  if (!posts || posts.length === 0) {
    return (
      <div className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>게시글이 존재하지 않습니다.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="terminal-header" style={{ padding: '6px 12px', fontSize: '13px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>실시간 게시글 피드</span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{posts.length} Posts</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {(isExpanded ? posts : posts.slice(0, INITIAL_COUNT)).map(post => {
          const sentiment = post.sentimentResults?.[0];
          const label = sentiment?.label || 'neutral';
          const badgeColor = label === 'support' ? 'var(--accent-up)' : label === 'criticize' ? 'var(--accent-down)' : 'var(--text-muted)';
          
          return (
            <div key={post.id} className="post-item" style={{
              padding: '16px',
              background: 'var(--bg-panel)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              borderBottom: '1px solid var(--border-color)'
            }}>
              {/* Header: Author & Time */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ 
                    width: '32px', height: '32px', borderRadius: '50%', 
                    background: 'rgba(59, 130, 246, 0.1)', display: 'flex', 
                    alignItems: 'center', justifyContent: 'center' 
                  }}>
                    <User size={16} color="var(--accent-brand)" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff' }}>
                      {post.authorName || '익명'}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontWeight: 600 }}>ID: {post.authorHash.slice(0, 8)}</span>
                      <span>•</span>
                      <span>{format(new Date(post.createdAt), 'MM.dd HH:mm')}</span>
                    </div>
                  </div>
                </div>
                
                <div style={{ 
                  color: badgeColor, fontSize: '10px', fontWeight: 800, 
                  border: `1px solid ${badgeColor}`, padding: '4px 8px', borderRadius: '4px',
                  background: `${badgeColor}10`, letterSpacing: '0.05em'
                }}>
                  {label.toUpperCase()} {sentiment ? `${(sentiment.confidence * 100).toFixed(0)}%` : ''}
                </div>
              </div>
              
              {/* Content */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {post.title && (
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-active)', lineHeight: 1.5 }}>
                    {post.title}
                  </h4>
                )}
                <p style={{ 
                  margin: 0, 
                  fontSize: '13px', 
                  color: 'var(--text-secondary)', 
                  lineHeight: 1.6,
                  wordBreak: 'break-all',
                  whiteSpace: 'pre-wrap'
                }}>
                  {post.body.trim().length > 0 ? post.body : '(내용 없음)'}
                </p>
              </div>

              {sentiment?.rationale && (
                <div style={{ 
                  fontSize: '12px', 
                  color: 'var(--text-active)', 
                  background: 'rgba(59, 130, 246, 0.05)', 
                  padding: '12px', 
                  borderRadius: '8px', 
                  display: 'flex',
                  gap: '10px',
                  borderLeft: '3px solid var(--accent-brand)'
                }}>
                  <Quote size={14} color="var(--accent-brand)" style={{ flexShrink: 0, opacity: 0.6, marginTop: '2px' }} />
                  <span style={{ fontStyle: 'italic', lineHeight: 1.5 }}>{sentiment.rationale}</span>
                </div>
              )}

              {/* Footer Actions */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'flex-end', 
                alignItems: 'center', 
                marginTop: '4px',
                gap: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <MessageSquare size={13} />
                  <span style={{ fontWeight: 700 }}>{(post as any)._count?.comments || 0}</span>
                </div>
                <a 
                  href={post.url} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="external-link-btn"
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '4px', 
                    color: 'var(--accent-brand)',
                    fontSize: '11px',
                    fontWeight: 700,
                    textDecoration: 'none'
                  }}
                >
                  SOURCE <ExternalLink size={12} />
                </a>
              </div>
            </div>
          )
        })}
      </div>

      {posts.length > INITIAL_COUNT && (
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          style={{ 
            width: '100%', padding: '12px', background: 'rgba(0,0,0,0.2)', 
            border: 'none', color: 'var(--accent-brand)', fontSize: '12px', 
            fontWeight: 800, display: 'flex', alignItems: 'center', 
            justifyContent: 'center', gap: '8px', cursor: 'pointer' 
          }}
        >
          {isExpanded ? (
            <>COLLAPSE_POSTS <ChevronUp size={14} /></>
          ) : (
            <>VIEW_ALL_POSTS ({posts.length}) <ChevronDown size={14} /></>
          )}
        </button>
      )}

      <style>{`
        .post-item { transition: background 0.1s; }
        .post-item:hover { background: var(--bg-hover); }
        .external-link-btn:hover { text-decoration: underline !important; }
        .post-scroll-area::-webkit-scrollbar {
          width: 4px;
        }
      `}</style>
    </div>
  );
}

