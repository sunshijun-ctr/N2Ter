import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppStore } from '@/stores/useAppStore'

export function OverviewPage() {
  const navigate = useNavigate()
  const { currentNovel, overviewData, overviewLoading, loadOverview, setExportDialogOpen } =
    useAppStore()

  useEffect(() => {
    void loadOverview()
  }, [currentNovel?.id, loadOverview])

  if (!currentNovel) {
    return (
      <>
        <PageHeader title="概览版剧本" description="请先在侧边栏选择项目" />
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          暂无选中项目
        </div>
      </>
    )
  }

  const overview = overviewData
  const metrics = overview
    ? [
        {
          k: '市场类比',
          v: overview.marketComparable || '待 AI 分析',
        },
        {
          k: '改编难度',
          v: overview.adaptationDifficulty || '待评估',
        },
        {
          k: '建议集数',
          v: `${overview.estimatedEpisodes} 集`,
        },
      ]
    : []

  return (
    <>
      <PageHeader
        title="概览版剧本"
        description={`《${currentNovel.title}》· 预处理 Stage 6 自动生成的全书改编报告`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setExportDialogOpen(true)}>
              导出
            </Button>
            <Button size="sm" onClick={() => navigate('/schema-select')}>
              选择详细版类型
            </Button>
          </div>
        }
      />
      <div className="flex-1 overflow-auto p-6">
        {overviewLoading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载概览版…
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Logline</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {overview?.logline || currentNovel.summary || '预处理完成后自动生成…'}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {metrics.map((m) => (
                <Card key={m.k}>
                  <CardContent className="p-5">
                    <div className="text-xs text-muted-foreground">{m.k}</div>
                    <div className="mt-1 text-lg font-semibold">{m.v}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {overview && overview.episodes.length > 0 && (
              <p className="text-center text-xs text-muted-foreground">
                建议集数与下方分集大纲一致（共 {overview.episodes.length} 集）
              </p>
            )}

            {overview?.isFallback && (
              <p className="text-center text-xs text-muted-foreground">
                概览版尚未生成，当前为基于章节数的估算预览
              </p>
            )}

            <Card>
              <CardHeader>
                <CardTitle>分集大纲</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {(overview?.episodes ?? []).length === 0 ? (
                  <p className="text-muted-foreground">暂无分集大纲，请等待预处理完成</p>
                ) : (
                  overview!.episodes.map((item) => (
                    <div key={item.episodeNum} className="flex gap-3 border-b pb-2 last:border-0">
                      <span className="w-16 shrink-0 text-muted-foreground">
                        第 {item.episodeNum} 集
                      </span>
                      <span>{item.oneLineSummary || item.title}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  )
}
