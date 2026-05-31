import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, GitBranch, Filter, SortAsc, SortDesc } from 'lucide-react';
import type { MappingRule } from '@shared/index';
import { cn } from '@/lib/utils';
import MappingCard from './MappingCard';

interface MappingListProps {
  mappings: MappingRule[];
  onAdd: () => void;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (mapping: MappingRule) => void;
  onDelete: (id: string) => void;
  onTest?: (mapping: MappingRule) => void;
  activeMappingId?: string | null;
  className?: string;
}

type SortField = 'name' | 'createdAt' | 'enabled';
type SortOrder = 'asc' | 'desc';
type FilterType = 'all' | 'enabled' | 'disabled' | 'keyboard' | 'mouse';

export default function MappingList({
  mappings,
  onAdd,
  onToggle,
  onEdit,
  onDelete,
  onTest,
  activeMappingId = null,
  className,
}: MappingListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filter, setFilter] = useState<FilterType>('all');
  const [showFilters, setShowFilters] = useState(false);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const filteredAndSortedMappings = mappings
    .filter((mapping) => {
      const matchesSearch =
        mapping.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        mapping.midiTrigger.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        mapping.action.type.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesFilter =
        filter === 'all' ||
        (filter === 'enabled' && mapping.enabled) ||
        (filter === 'disabled' && !mapping.enabled) ||
        (filter === 'keyboard' && mapping.action.type === 'keyboard') ||
        (filter === 'mouse' && mapping.action.type !== 'keyboard');

      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'createdAt':
          comparison = a.createdAt - b.createdAt;
          break;
        case 'enabled':
          comparison = (a.enabled ? 1 : 0) - (b.enabled ? 1 : 0);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const enabledCount = mappings.filter((m) => m.enabled).length;
  const keyboardCount = mappings.filter((m) => m.action.type === 'keyboard').length;
  const mouseCount = mappings.filter((m) => m.action.type !== 'keyboard').length;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <GitBranch className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text">映射规则</h3>
            <p className="text-sm text-text-muted">
              共 {mappings.length} 条规则，{enabledCount} 条已启用
            </p>
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onAdd}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-background rounded-lg font-medium hover:bg-primary-dark hover:shadow-glow-primary transition-all"
        >
          <Plus className="w-5 h-5" />
          添加映射
        </motion.button>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索映射规则..."
              className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:border-primary transition-all"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'p-2 rounded-lg border transition-all',
              showFilters
                ? 'bg-primary/10 border-primary/50 text-primary'
                : 'bg-surface border-border text-text-muted hover:border-primary/30 hover:text-text'
            )}
          >
            <Filter className="w-5 h-5" />
          </button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="p-4 rounded-xl bg-surface-light space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                    筛选
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { type: 'all' as FilterType, label: '全部', count: mappings.length },
                    { type: 'enabled' as FilterType, label: '已启用', count: enabledCount },
                    { type: 'disabled' as FilterType, label: '已禁用', count: mappings.length - enabledCount },
                    { type: 'keyboard' as FilterType, label: '键盘', count: keyboardCount },
                    { type: 'mouse' as FilterType, label: '鼠标', count: mouseCount },
                  ].map(({ type, label, count }) => (
                    <button
                      key={type}
                      onClick={() => setFilter(type)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-sm font-medium transition-all border',
                        filter === type
                          ? 'bg-primary/10 border-primary/50 text-primary'
                          : 'bg-surface border-border text-text-muted hover:border-primary/30 hover:text-text'
                      )}
                    >
                      {label}
                      <span className="ml-1.5 opacity-60">({count})</span>
                    </button>
                  ))}
                </div>

                <div className="border-t border-border pt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                      排序
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {[
                      { field: 'name' as SortField, label: '名称' },
                      { field: 'createdAt' as SortField, label: '创建时间' },
                      { field: 'enabled' as SortField, label: '状态' },
                    ].map(({ field, label }) => (
                      <button
                        key={field}
                        onClick={() => toggleSort(field)}
                        className={cn(
                          'flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border',
                          sortField === field
                            ? 'bg-primary/10 border-primary/50 text-primary'
                            : 'bg-surface border-border text-text-muted hover:border-primary/30 hover:text-text'
                        )}
                      >
                        {label}
                        {sortField === field && (
                          sortOrder === 'asc' ? (
                            <SortAsc className="w-3.5 h-3.5" />
                          ) : (
                            <SortDesc className="w-3.5 h-3.5" />
                          )
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-2">
        {filteredAndSortedMappings.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-16 text-center"
          >
            <GitBranch className="w-16 h-16 text-text-muted opacity-20 mb-4" />
            <h4 className="text-lg font-medium text-text mb-2">
              {mappings.length === 0 ? '暂无映射规则' : '没有匹配的规则'}
            </h4>
            <p className="text-text-muted mb-6">
              {mappings.length === 0
                ? '点击上方按钮创建第一条映射规则'
                : '尝试调整筛选条件或搜索关键词'}
            </p>
            {mappings.length === 0 && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onAdd}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-background rounded-lg font-medium hover:bg-primary-dark hover:shadow-glow-primary transition-all"
              >
                <Plus className="w-5 h-5" />
                创建第一条映射
              </motion.button>
            )}
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredAndSortedMappings.map((mapping) => (
              <MappingCard
                key={mapping.id}
                mapping={mapping}
                onToggle={onToggle}
                onEdit={onEdit}
                onDelete={onDelete}
                onTest={onTest}
                isActive={activeMappingId === mapping.id}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
