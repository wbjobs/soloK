module radtran_solver
    implicit none
    integer, parameter :: dp = selected_real_kind(15, 307)
    real(dp), parameter :: PI = 4.0_dp * atan(1.0_dp)
    
contains

    subroutine solve_2d_advection_dispersion( &
        nx, ny, dx, dy, &
        porosity, permeability, alpha_l, alpha_t, retardation, &
        n_nuclides, half_lives, distribution_coeffs, decay_chains, &
        source_mode, source_strength, source_x, source_y, source_radius, source_duration, &
        initial_conc, n_time_steps, max_time, output_times, &
        concentration, n_output, cfl_max, time_steps_output &
    ) bind(C, name='solve_2d_advection_dispersion')
        integer, intent(in) :: nx, ny, n_nuclides, n_time_steps, n_output
        real(dp), intent(in) :: dx, dy, porosity, permeability, alpha_l, alpha_t, retardation
        real(dp), intent(in), dimension(n_nuclides) :: half_lives, distribution_coeffs
        integer, intent(in), dimension(n_nuclides, n_nuclides) :: decay_chains
        integer, intent(in) :: source_mode
        real(dp), intent(in) :: source_strength, source_x, source_y, source_radius, source_duration
        real(dp), intent(in) :: initial_conc, max_time
        real(dp), intent(in), dimension(n_output) :: output_times
        real(dp), intent(out), dimension(nx, ny, n_nuclides, n_output) :: concentration
        real(dp), intent(out) :: cfl_max
        real(dp), intent(out), dimension(n_time_steps) :: time_steps_output
        
        real(dp), dimension(nx, ny, n_nuclides) :: conc, conc_old
        real(dp), dimension(nx, ny) :: u, v, D_xx, D_yy, D_xy
        real(dp), dimension(n_nuclides) :: decay_constants
        real(dp) :: dt, time, cfl, cfl_local, max_u, max_v
        real(dp) :: A_central, A_east, A_west, A_north, A_south
        integer :: i, j, k, t_idx, out_idx, it
        integer :: source_i, source_j
        
        decay_constants = log(2.0_dp) / half_lives
        
        call calculate_velocity_field(nx, ny, dx, dy, permeability, porosity, u, v)
        
        call calculate_dispersion_tensor(nx, ny, u, v, alpha_l, alpha_t, D_xx, D_yy, D_xy)
        
        conc = 0.0_dp
        conc_old = 0.0_dp
        
        source_i = int(source_x / dx) + 1
        source_j = int(source_y / dy) + 1
        source_i = min(max(source_i, 1), nx)
        source_j = min(max(source_j, 1), ny)
        
        if (source_mode == 0) then
            call apply_instant_source(nx, ny, n_nuclides, conc, source_strength, &
                                      source_i, source_j, source_radius, dx, dy)
        end if
        
        concentration = 0.0_dp
        out_idx = 1
        time = 0.0_dp
        it = 0
        
        do while (time < max_time .and. it < n_time_steps)
            it = it + 1
            
            max_u = maxval(abs(u))
            max_v = maxval(abs(v))
            dt = calculate_time_step(dx, dy, max_u, max_v, alpha_l, cfl_max)
            
            cfl_local = max(max_u * dt / dx, max_v * dt / dy)
            cfl_max = max(cfl_max, cfl_local)
            
            time_steps_output(it) = dt
            
            conc_old = conc
            
            do k = 1, n_nuclides
                call solve_2d_implicit(nx, ny, dx, dy, dt, u, v, D_xx, D_yy, D_xy, &
                                       retardation, 0.0_dp, conc_old(:,:,k), conc(:,:,k))
            end do
            
            call apply_decay_chain(nx, ny, n_nuclides, decay_constants, decay_chains, dt, retardation, conc)
            
            if (source_mode == 1 .and. time < source_duration) then
                call apply_continuous_source(nx, ny, n_nuclides, conc, source_strength, &
                                             source_i, source_j, source_radius, dx, dy, dt)
            end if
            
            if (out_idx <= n_output) then
                if (time + dt >= output_times(out_idx) .or. time >= max_time) then
                    concentration(:,:,:,out_idx) = conc
                    out_idx = out_idx + 1
                end if
            end if
            
            time = time + dt
        end do
        
    end subroutine solve_2d_advection_dispersion
    
    subroutine calculate_velocity_field(nx, ny, dx, dy, k, porosity, u, v)
        integer, intent(in) :: nx, ny
        real(dp), intent(in) :: dx, dy, k, porosity
        real(dp), intent(out), dimension(nx, ny) :: u, v
        
        integer :: i, j
        real(dp) :: x, y, grad_h_x, grad_h_y
        
        do j = 1, ny
            do i = 1, nx
                x = (i - 0.5_dp) * dx
                y = (j - 0.5_dp) * dy
                
                grad_h_x = 0.001_dp
                grad_h_y = 0.0_dp
                
                u(i,j) = -(k / porosity) * grad_h_x
                v(i,j) = -(k / porosity) * grad_h_y
            end do
        end do
        
    end subroutine calculate_velocity_field
    
    subroutine calculate_dispersion_tensor(nx, ny, u, v, alpha_l, alpha_t, D_xx, D_yy, D_xy)
        integer, intent(in) :: nx, ny
        real(dp), intent(in), dimension(nx, ny) :: u, v
        real(dp), intent(in) :: alpha_l, alpha_t
        real(dp), intent(out), dimension(nx, ny) :: D_xx, D_yy, D_xy
        
        integer :: i, j
        real(dp) :: v_mag, D_m
        
        D_m = 1.0e-9_dp
        
        do j = 1, ny
            do i = 1, nx
                v_mag = sqrt(u(i,j)**2 + v(i,j)**2)
                
                if (v_mag > 1.0e-10_dp) then
                    D_xx(i,j) = D_m + (alpha_l * u(i,j)**2 + alpha_t * v(i,j)**2) / v_mag
                    D_yy(i,j) = D_m + (alpha_l * v(i,j)**2 + alpha_t * u(i,j)**2) / v_mag
                    D_xy(i,j) = (alpha_l - alpha_t) * u(i,j) * v(i,j) / v_mag
                else
                    D_xx(i,j) = D_m
                    D_yy(i,j) = D_m
                    D_xy(i,j) = 0.0_dp
                end if
            end do
        end do
        
    end subroutine calculate_dispersion_tensor
    
    function calculate_time_step(dx, dy, max_u, max_v, alpha_l, cfl_target) result(dt)
        real(dp), intent(in) :: dx, dy, max_u, max_v, alpha_l, cfl_target
        real(dp) :: dt, dt_adv, dt_disp
        
        dt_adv = huge(1.0_dp)
        if (max_u > 1.0e-10_dp) dt_adv = min(dt_adv, cfl_target * dx / max_u)
        if (max_v > 1.0e-10_dp) dt_adv = min(dt_adv, cfl_target * dy / max_v)
        
        dt_disp = huge(1.0_dp)
        if (alpha_l > 1.0e-10_dp .and. max_u > 1.0e-10_dp) then
            dt_disp = 0.5_dp * min(dx**2, dy**2) / (alpha_l * max(max_u, max_v) + 1.0e-9_dp)
        end if
        
        dt = min(dt_adv, dt_disp)
        dt = min(dt, 86400.0_dp * 365.25_dp)
        
    end function calculate_time_step
    
    subroutine solve_2d_implicit(nx, ny, dx, dy, dt, u, v, D_xx, D_yy, D_xy, R, lambda, conc_old, conc_new)
        integer, intent(in) :: nx, ny
        real(dp), intent(in) :: dx, dy, dt, R, lambda
        real(dp), intent(in), dimension(nx, ny) :: u, v, D_xx, D_yy, D_xy
        real(dp), intent(in), dimension(nx, ny) :: conc_old
        real(dp), intent(out), dimension(nx, ny) :: conc_new
        
        real(dp), dimension(nx, ny) :: x_new, x_old
        real(dp) :: A_central, A_east, A_west, A_north, A_south
        real(dp) :: Pe_x, Pe_y, adv_west, adv_east, adv_south, adv_north
        integer :: i, j, iter
        real(dp) :: residual, tol
        
        conc_new = conc_old
        x_old = conc_old
        
        tol = 1.0e-6_dp
        
        do iter = 1, 1000
            x_new = x_old
            
            do j = 2, ny-1
                do i = 2, nx-1
                    Pe_x = abs(u(i,j)) * dx / max(D_xx(i,j), 1.0e-15_dp)
                    Pe_y = abs(v(i,j)) * dy / max(D_yy(i,j), 1.0e-15_dp)
                    
                    if (Pe_x > 2.0_dp) then
                        if (u(i,j) > 0) then
                            adv_west = u(i,j) / dx
                            adv_east = 0.0_dp
                        else
                            adv_west = 0.0_dp
                            adv_east = -u(i,j) / dx
                        end if
                    else
                        adv_west = u(i,j) / (2.0_dp * dx)
                        adv_east = -u(i,j) / (2.0_dp * dx)
                    end if
                    
                    if (Pe_y > 2.0_dp) then
                        if (v(i,j) > 0) then
                            adv_south = v(i,j) / dy
                            adv_north = 0.0_dp
                        else
                            adv_south = 0.0_dp
                            adv_north = -v(i,j) / dy
                        end if
                    else
                        adv_south = v(i,j) / (2.0_dp * dy)
                        adv_north = -v(i,j) / (2.0_dp * dy)
                    end if
                    
                    A_west  = -D_xx(i,j) / (R * dx**2) + adv_west / R
                    A_east  = -D_xx(i,j) / (R * dx**2) + adv_east / R
                    A_south = -D_yy(i,j) / (R * dy**2) + adv_south / R
                    A_north = -D_yy(i,j) / (R * dy**2) + adv_north / R
                    A_central = 1.0_dp / dt + (D_xx(i,j) + D_xx(i,j)) / (R * dx**2) + &
                                           (D_yy(i,j) + D_yy(i,j)) / (R * dy**2) + lambda / R
                    
                    x_new(i,j) = (conc_old(i,j) / dt - A_west * x_old(i-1,j) &
                                          - A_east * x_old(i+1,j) &
                                          - A_south * x_old(i,j-1) &
                                          - A_north * x_old(i,j+1)) / A_central
                end do
            end do
            
            residual = maxval(abs(x_new - x_old))
            x_old = x_new
            
            if (residual < tol) exit
        end do
        
        conc_new = max(x_old, 0.0_dp)
        
    end subroutine solve_2d_implicit
    
    subroutine solve_tridiagonal_2d(nx, ny, A_west, A_east, A_south, A_north, A_central, b, x)
        integer, intent(in) :: nx, ny
        real(dp), intent(in) :: A_west, A_east, A_south, A_north, A_central
        real(dp), intent(in), dimension(nx, ny) :: b
        real(dp), intent(out), dimension(nx, ny) :: x
        
        real(dp), dimension(nx, ny) :: x_new, x_old
        real(dp) :: residual, tol
        integer :: iter, max_iter
        
        max_iter = 1000
        tol = 1.0e-6_dp
        
        x = b
        x_old = x
        
        do iter = 1, max_iter
            x_new = x_old
            
            do j = 2, ny-1
                do i = 2, nx-1
                    x_new(i,j) = (b(i,j) - A_west * x_old(i-1,j) - A_east * x_old(i+1,j) &
                                            - A_south * x_old(i,j-1) - A_north * x_old(i,j+1)) / A_central
                end do
            end do
            
            residual = maxval(abs(x_new - x_old))
            x_old = x_new
            
            if (residual < tol) exit
        end do
        
        x = x_old
        
    end subroutine solve_tridiagonal_2d
    
    subroutine apply_instant_source(nx, ny, n_nuclides, conc, strength, si, sj, radius, dx, dy)
        integer, intent(in) :: nx, ny, n_nuclides, si, sj
        real(dp), intent(inout), dimension(nx, ny, n_nuclides) :: conc
        real(dp), intent(in) :: strength, radius, dx, dy
        
        integer :: i, j, k
        real(dp) :: dist, r_cell
        
        r_cell = radius / min(dx, dy)
        
        do k = 1, n_nuclides
            do j = 1, ny
                do i = 1, nx
                    dist = sqrt(real(i - si, dp)**2 + real(j - sj, dp)**2)
                    if (dist <= r_cell) then
                        conc(i,j,k) = strength * exp(-dist**2 / (2.0_dp * (r_cell/3.0_dp)**2))
                    end if
                end do
            end do
        end do
        
    end subroutine apply_instant_source
    
    subroutine apply_continuous_source(nx, ny, n_nuclides, conc, strength, si, sj, radius, dx, dy, dt)
        integer, intent(in) :: nx, ny, n_nuclides, si, sj
        real(dp), intent(inout), dimension(nx, ny, n_nuclides) :: conc
        real(dp), intent(in) :: strength, radius, dx, dy, dt
        
        integer :: i, j, k
        real(dp) :: dist, r_cell, source_rate
        
        r_cell = radius / min(dx, dy)
        source_rate = strength * dt / (PI * r_cell**2)
        
        do k = 1, n_nuclides
            do j = 1, ny
                do i = 1, nx
                    dist = sqrt(real(i - si, dp)**2 + real(j - sj, dp)**2)
                    if (dist <= r_cell) then
                        conc(i,j,k) = conc(i,j,k) + source_rate * exp(-dist**2 / (2.0_dp * (r_cell/3.0_dp)**2))
                    end if
                end do
            end do
        end do
        
    end subroutine apply_continuous_source
    
    subroutine apply_decay_chain(nx, ny, n_nuclides, lambdas, chains, dt, R, conc)
        integer, intent(in) :: nx, ny, n_nuclides
        real(dp), intent(in), dimension(n_nuclides) :: lambdas
        integer, intent(in), dimension(n_nuclides, n_nuclides) :: chains
        real(dp), intent(in) :: dt, R
        real(dp), intent(inout), dimension(nx, ny, n_nuclides) :: conc
        
        integer :: i, j, k, parent
        real(dp), dimension(nx, ny, n_nuclides) :: decay_loss, decay_gain
        
        decay_loss = 0.0_dp
        decay_gain = 0.0_dp
        
        do k = 1, n_nuclides
            do j = 1, ny
                do i = 1, nx
                    decay_loss(i,j,k) = conc(i,j,k) * (1.0_dp - exp(-lambdas(k) * dt / R))
                end do
            end do
        end do
        
        do k = 1, n_nuclides
            do parent = 1, n_nuclides
                if (chains(parent, k) == 1) then
                    do j = 1, ny
                        do i = 1, nx
                            decay_gain(i,j,k) = decay_gain(i,j,k) + &
                                conc(i,j,parent) * (1.0_dp - exp(-lambdas(parent) * dt / R))
                        end do
                    end do
                end if
            end do
        end do
        
        do k = 1, n_nuclides
            do j = 1, ny
                do i = 1, nx
                    conc(i,j,k) = max(conc(i,j,k) - decay_loss(i,j,k) + decay_gain(i,j,k), 0.0_dp)
                end do
            end do
        end do
        
    end subroutine apply_decay_chain

end module radtran_solver
