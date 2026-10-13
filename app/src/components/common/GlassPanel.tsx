import type { HTMLAttributes, ReactNode } from 'react';

export interface GlassPanelProps extends HTMLAttributes<HTMLElement> {
  /** main: 주요 패널(기본 단계에서도 유리), minor: 보조 패널(고화질에서만 유리). 저사양에서는 둘 다 흰 단색 */
  level?: 'main' | 'minor';
  as?: 'div' | 'section' | 'aside' | 'nav' | 'header';
  children?: ReactNode;
}

/**
 * 3D 화면 위에 떠 있는 패널. 유리 효과는 화질 단계에 따라 켜지고(styles/index.css의 .glass),
 * 꺼지면 흰 단색과 그림자로 보여서 어느 단계에서나 글자가 읽힌다.
 */
export function GlassPanel({ level = 'main', as: Tag = 'div', className = '', children, ...rest }: GlassPanelProps) {
  return (
    <Tag className={`${level === 'main' ? 'glass' : 'glass-minor'} rounded-card ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
