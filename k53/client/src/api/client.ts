import type {
  Room,
  Member,
  Snapshot,
  Operation,
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  GetRoomResponse,
  GetRoomsResponse,
  CreateSnapshotRequest,
  CreateSnapshotResponse,
  GetSnapshotsResponse,
  GetSnapshotResponse,
  RestoreSnapshotResponse,
  GetOperationsRequest,
  GetOperationsResponse,
  ReplayOperationsRequest,
  ReplayOperationsResponse,
  SaveOperationRequest,
  SaveOperationResponse,
  ApiResponse,
  ApiError,
  ForkRoomRequest,
  ForkRoomResponse,
  ListBranchesResponse
} from '../types/api'
import type { GraphData } from '../types/graph'
import type { CRDTOperationEnvelope } from '../types/crdt'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'

class ApiClient {
  private token: string | null = null
  private baseUrl: string

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl
  }

  setToken(token: string | null): void {
    this.token = token
  }

  getToken(): string | null {
    return this.token
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include'
      })

      const data = await response.json()

      if (!response.ok) {
        const errorData = data as { error?: ApiError }
        return {
          success: false,
          error: errorData.error || {
            code: 'UNKNOWN_ERROR',
            message: `HTTP ${response.status}: ${response.statusText}`
          }
        }
      }

      return {
        success: true,
        data: data as T
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : '网络连接失败'
        }
      }
    }
  }

  async createRoom(request: CreateRoomRequest): Promise<ApiResponse<CreateRoomResponse>> {
    return this.request<CreateRoomResponse>('/rooms', {
      method: 'POST',
      body: JSON.stringify(request)
    })
  }

  async joinRoom(roomId: string, request: JoinRoomRequest): Promise<ApiResponse<JoinRoomResponse>> {
    return this.request<JoinRoomResponse>(`/rooms/${roomId}/join`, {
      method: 'POST',
      body: JSON.stringify(request)
    })
  }

  async getRoom(roomId: string): Promise<ApiResponse<GetRoomResponse>> {
    return this.request<GetRoomResponse>(`/rooms/${roomId}`)
  }

  async getRooms(): Promise<ApiResponse<GetRoomsResponse>> {
    return this.request<GetRoomsResponse>('/rooms')
  }

  async deleteRoom(roomId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/rooms/${roomId}`, {
      method: 'DELETE'
    })
  }

  async createSnapshot(
    roomId: string,
    request: CreateSnapshotRequest
  ): Promise<ApiResponse<CreateSnapshotResponse>> {
    return this.request<CreateSnapshotResponse>(`/rooms/${roomId}/snapshots`, {
      method: 'POST',
      body: JSON.stringify(request)
    })
  }

  async getSnapshots(roomId: string): Promise<ApiResponse<GetSnapshotsResponse>> {
    return this.request<GetSnapshotsResponse>(`/rooms/${roomId}/snapshots`)
  }

  async getSnapshot(
    roomId: string,
    snapshotId: string
  ): Promise<ApiResponse<GetSnapshotResponse>> {
    return this.request<GetSnapshotResponse>(`/rooms/${roomId}/snapshots/${snapshotId}`)
  }

  async restoreSnapshot(
    roomId: string,
    snapshotId: string
  ): Promise<ApiResponse<RestoreSnapshotResponse>> {
    return this.request<RestoreSnapshotResponse>(
      `/rooms/${roomId}/snapshots/${snapshotId}/restore`,
      {
        method: 'POST'
      }
    )
  }

  async deleteSnapshot(
    roomId: string,
    snapshotId: string
  ): Promise<ApiResponse<void>> {
    return this.request<void>(`/rooms/${roomId}/snapshots/${snapshotId}`, {
      method: 'DELETE'
    })
  }

  async getOperations(
    roomId: string,
    params?: GetOperationsRequest
  ): Promise<ApiResponse<GetOperationsResponse>> {
    const queryParams = new URLSearchParams()
    if (params?.from !== undefined) queryParams.set('from', params.from.toString())
    if (params?.to !== undefined) queryParams.set('to', params.to.toString())
    if (params?.limit !== undefined) queryParams.set('limit', params.limit.toString())
    if (params?.offset !== undefined) queryParams.set('offset', params.offset.toString())

    const queryString = queryParams.toString()
    const endpoint = `/rooms/${roomId}/operations${queryString ? `?${queryString}` : ''}`

    return this.request<GetOperationsResponse>(endpoint)
  }

  async saveOperation(
    roomId: string,
    request: SaveOperationRequest
  ): Promise<ApiResponse<SaveOperationResponse>> {
    return this.request<SaveOperationResponse>(`/rooms/${roomId}/operations`, {
      method: 'POST',
      body: JSON.stringify(request)
    })
  }

  async replayOperations(
    roomId: string,
    request?: ReplayOperationsRequest
  ): Promise<ApiResponse<ReplayOperationsResponse>> {
    return this.request<ReplayOperationsResponse>(`/rooms/${roomId}/operations/replay`, {
      method: 'POST',
      body: JSON.stringify(request || {})
    })
  }

  async getRoomMembers(roomId: string): Promise<ApiResponse<Member[]>> {
    const response = await this.request<{ members: Member[] }>(`/rooms/${roomId}/members`)
    if (response.success && response.data) {
      return { success: true, data: response.data.members }
    }
    return { success: false, error: response.error }
  }

  async updateMemberColor(
    roomId: string,
    memberId: string,
    color: string
  ): Promise<ApiResponse<Member>> {
    return this.request<Member>(`/rooms/${roomId}/members/${memberId}/color`, {
      method: 'PATCH',
      body: JSON.stringify({ color })
    })
  }

  async leaveRoom(roomId: string, memberId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/rooms/${roomId}/members/${memberId}/leave`, {
      method: 'POST'
    })
  }

  async getGraphData(roomId: string): Promise<ApiResponse<GraphData>> {
    const response = await this.request<{ graphData: GraphData }>(`/rooms/${roomId}/graph`)
    if (response.success && response.data) {
      return { success: true, data: response.data.graphData }
    }
    return { success: false, error: response.error }
  }

  async saveGraphData(
    roomId: string,
    graphData: GraphData
  ): Promise<ApiResponse<void>> {
    return this.request<void>(`/rooms/${roomId}/graph`, {
      method: 'PUT',
      body: JSON.stringify({ graphData })
    })
  }

  async saveCRDTOperation(
    roomId: string,
    operation: CRDTOperationEnvelope
  ): Promise<ApiResponse<SaveOperationResponse>> {
    return this.request<SaveOperationResponse>(`/rooms/${roomId}/crdt`, {
      method: 'POST',
      body: JSON.stringify({ operation })
    })
  }

  async getCRDTOperations(
    roomId: string,
    fromVersion?: number
  ): Promise<ApiResponse<{ operations: CRDTOperationEnvelope[]; latestVersion: number }>> {
    const queryParams = new URLSearchParams()
    if (fromVersion !== undefined) {
      queryParams.set('fromVersion', fromVersion.toString())
    }
    const queryString = queryParams.toString()
    const endpoint = `/rooms/${roomId}/crdt${queryString ? `?${queryString}` : ''}`

    return this.request<{ operations: CRDTOperationEnvelope[]; latestVersion: number }>(endpoint)
  }

  async forkRoom(roomId: string, request: ForkRoomRequest): Promise<ApiResponse<ForkRoomResponse>> {
    return this.request<ForkRoomResponse>(`/rooms/${roomId}/fork`, {
      method: 'POST',
      body: JSON.stringify(request)
    })
  }

  async listBranches(roomId: string): Promise<ApiResponse<ListBranchesResponse>> {
    return this.request<ListBranchesResponse>(`/rooms/${roomId}/branches`)
  }
}

export const apiClient = new ApiClient()

export type {
  Room,
  Member,
  Snapshot,
  Operation,
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  GetRoomResponse,
  GetRoomsResponse,
  CreateSnapshotRequest,
  CreateSnapshotResponse,
  GetSnapshotsResponse,
  GetSnapshotResponse,
  RestoreSnapshotResponse,
  GetOperationsRequest,
  GetOperationsResponse,
  ReplayOperationsRequest,
  ReplayOperationsResponse,
  SaveOperationRequest,
  SaveOperationResponse,
  ApiResponse,
  ApiError
}
