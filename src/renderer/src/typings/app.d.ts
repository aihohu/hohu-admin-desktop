/**
 * 后端统一响应结构（与 hohu-admin 后端约定）
 * 注意：code 实际是 int（后端 Pydantic ResponseModel.code: int = 200），
 * 比较时统一用 String(code) 转字符串，与 .env 的业务码（字符串）对齐。
 */
interface Response<T = unknown> {
  code: number
  msg: string
  data: T
  errorCode?: string
}

/**
 * 分页查询参数
 */
interface PaginatingQuery {
  current: number
  size: number
}

/**
 * 分页响应结构
 */
interface PaginatingRecord<T = unknown> extends PaginatingQuery {
  total: number
  records: T[]
}

/**
 * 通用记录基类（带审计字段）
 */
interface CommonRecord {
  id: string
  createBy: string
  createTime: string
  updateBy: string
  updateTime: string
  status: '1' | '2' | null
}
